<script runat="server">

Platform.Load("Core", "1");

/* =========================================
   Configuration
========================================= */

var AUTH_BASE_URI =
    "https://SFMC_DOMAIN.auth.marketingcloudapis.com";

var CLIENT_ID = "YOUR_CLIENT_ID";
var CLIENT_SECRET = "YOUR_CLIENT_SECRET";

var SOURCE_DE = "BusinessUnit_CountryCode";

/*
   Define all queries to update here.
   Each entry will be applied to every active BU
   read from SOURCE_DE.
   Add or remove entries as needed.
*/
var QUERIES = [
    {
        name: "Daily_Subscriber_Extract",
        description: "Extracts active subscribers daily",
        sql: [
            "SELECT",
            "    s.SubscriberKey,",
            "    s.EmailAddress,",
            "    s.Status",
            "FROM _Subscribers s",
            "WHERE s.Status = 'Active'"
        ].join("\n")
    }
];


/* =========================================
   Helper functions
========================================= */

function text(value) {
    if (value === null || typeof value === "undefined") {
        return "";
    }
    return String(value);
}

function getCurrentDateString() {
    var d = new Date();
    var p = function(n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" +
           p(d.getMonth() + 1) + "-" +
           p(d.getDate()) + " " +
           p(d.getHours()) + ":" +
           p(d.getMinutes()) + ":" +
           p(d.getSeconds());
}


/* =========================================
   Read BUMIDs from source DE
========================================= */

function getBusinessUnits() {
    var rows = Platform.Function.LookupRows(
        SOURCE_DE,
        "IsActive",
        "True"
    );

    if (!rows || rows.length === 0) {
        throw new Error(
            "No active rows found in " + SOURCE_DE +
            ". Check the ENT. prefix and IsActive values."
        );
    }

    return rows;
}


/* =========================================
   Get OAuth token — cached per BUMID
========================================= */

var tokenCache = {};

function getAccessToken(buMid) {
    if (tokenCache[buMid]) {
        return tokenCache[buMid];
    }

    var tokenURL = AUTH_BASE_URI + "/v2/token";

    var payload = {
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        account_id: String(buMid)
    };

    var response = HTTP.Post(
        tokenURL,
        "application/json",
        Stringify(payload)
    );

    var body = "";

    if (response.Response && response.Response.length > 0) {
        body = String(response.Response[0]);
    }

    if (String(response.StatusCode) !== "200") {
        throw new Error(
            "OAuth failed for BUMID " + buMid +
            ". HTTP " + response.StatusCode + ": " + body
        );
    }

    var token = Platform.Function.ParseJSON(body);

    if (!token.access_token) {
        throw new Error(
            "No access_token returned for BUMID " + buMid
        );
    }

    if (!token.rest_instance_url) {
        throw new Error(
            "No rest_instance_url returned for BUMID " + buMid
        );
    }

    tokenCache[buMid] = token;
    return token;
}


/* =========================================
   Get QueryDefinition ObjectID + CustomerKey
   from child BU using WSProxy setClientId
========================================= */

function getQueryDefinition(buMid, queryName) {
    var api = new Script.Util.WSProxy();

    api.setClientId({ "ID": buMid });

    var request = api.retrieve(
        "QueryDefinition",
        ["ObjectID", "CustomerKey", "Name", "Description"],
        {
            Property: "Name",
            SimpleOperator: "equals",
            Value: queryName
        }
    );

    if (!request.Results || request.Results.length === 0) {
        throw new Error(
            "Query not found: '" + queryName +
            "' in BUMID " + buMid
        );
    }

    return {
        objectID:    request.Results[0].ObjectID,
        customerKey: request.Results[0].CustomerKey,
        name:        request.Results[0].Name,
        description: request.Results[0].Description || ""
    };
}


/* =========================================
   Update the query via REST API PATCH
========================================= */

function updateQuery(
    accessToken,
    restInstanceURL,
    queryDef,
    newSQL,
    newDescription
) {
    var endpoint =
        restInstanceURL +
        "automation/v1/queries/" +
        queryDef.objectID;

    var payload = {
        "name":        queryDef.name,
        "key":         queryDef.customerKey,
        "description": newDescription !== "" ? newDescription : queryDef.description,
        "queryText":   newSQL
    };

    var request = new Script.Util.HttpRequest(endpoint);

    request.method = "PATCH";
    request.contentType = "application/json";
    request.emptyContentHandling = 0;
    request.continueOnError = true;
    request.retries = 2;
    request.encoding = "UTF-8";

    request.setHeader(
        "Authorization",
        "Bearer " + accessToken
    );

    request.postData = Stringify(payload);

    var response = request.send();

    if (
        response.statusCode < 200 ||
        response.statusCode >= 300
    ) {
        throw new Error(
            "Query update failed. HTTP " +
            response.statusCode + ": " + response.content
        );
    }

    return Platform.Function.ParseJSON(
        String(response.content)
    );
}


/* =========================================
   Main process
   Loops: each BU x each query in QUERIES
========================================= */

var buCount      = 0;
var updatedCount = 0;
var skippedCount = 0;
var errorCount   = 0;
var errors       = [];

try {
    var buRows = getBusinessUnits();

    buCount = buRows.length;

    for (var i = 0; i < buRows.length; i++) {
        var buRow  = buRows[i];
        var buMid  = text(buRow["BUMID"]);
        var buName = text(buRow["BUName"]);

        for (var q = 0; q < QUERIES.length; q++) {
            var query = QUERIES[q];

            try {
                /*
                   Step 1: get ObjectID from child BU
                */
                var queryDef = getQueryDefinition(
                    buMid,
                    query.name
                );

                /*
                   Step 2: get OAuth token (cached per BU)
                */
                var token = getAccessToken(buMid);

                /*
                   Step 3: PATCH the query with new SQL
                */
                updateQuery(
                    token.access_token,
                    token.rest_instance_url,
                    queryDef,
                    query.sql,
                    query.description
                );

                updatedCount++;

            } catch (queryError) {
                var errMsg = String(queryError);

                /*
                   If the query simply does not exist in this BU
                   treat it as a skip rather than a hard error.
                */
                if (errMsg.indexOf("Query not found") !== -1) {
                    skippedCount++;
                } else {
                    errorCount++;
                    errors.push({
                        BUMID:     buMid,
                        BUName:    buName,
                        QueryName: query.name,
                        Error:     errMsg
                    });
                }
            }
        }
    }

    Write("<h2>Query update process completed</h2>");
    Write("<p>Run time: "          + getCurrentDateString() + "</p>");
    Write("<p>BUs processed: "     + buCount      + "</p>");
    Write("<p>Queries in script: " + QUERIES.length + "</p>");
    Write("<p>Updated: "           + updatedCount  + "</p>");
    Write("<p>Skipped (not found in BU): " + skippedCount + "</p>");
    Write("<p>Errors: "            + errorCount    + "</p>");

    if (errorCount > 0) {
        Write("<h3>Error details</h3>");
        Write("<pre>");
        Write(Stringify(errors));
        Write("</pre>");
    }

} catch (fatalError) {
    Write("<h2>Fatal error</h2>");
    Write("<pre>");
    Write(Stringify({
        Error:    String(fatalError),
        SourceDE: SOURCE_DE
    }));
    Write("</pre>");
}

</script>
