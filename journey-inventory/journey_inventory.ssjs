<script runat="server">

Platform.Load("Core", "1");

/* =========================================
   Configuration
========================================= */

var AUTH_BASE_URI =
    "https://SFMC_DOMAIN.auth.marketingcloudapis.com";

var CLIENT_ID = "XXXXXXXXXXXXXX";
var CLIENT_SECRET = "XXXXXXXXXXXXXXXXXX";

/*
   These DEs are in Shared Data Extensions.

   If this script runs in a child BU, use ENT. prefix (default below).
   If it runs in the Enterprise/Parent BU, remove the ENT. prefix.
*/
var SOURCE_DE = "BusinessUnit_CountryCode";
var TARGET_DE = "Enterprise_Journey_Inventory";

var PAGE_SIZE = 50;


/* =========================================
   Helper functions
========================================= */

function text(value) {
    if (value === null || typeof value === "undefined") {
        return "";
    }
    return String(value);
}

function firstValue(object, fields) {
    for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        if (
            object[field] !== null &&
            typeof object[field] !== "undefined" &&
            object[field] !== ""
        ) {
            return object[field];
        }
    }
    return "";
}

function formatDate(value) {
    if (value === null || typeof value === "undefined" || value === "") {
        return "";
    }

    var valueText = String(value);

    var match = valueText.match(
        /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/
    );

    if (match) {
        return match[1] + "-" +
               match[2] + "-" +
               match[3] + " " +
               match[4] + ":" +
               match[5] + ":" +
               match[6];
    }

    return valueText;
}

/*
   Returns current date/time as "YYYY-MM-DD HH:MM:SS".
   Avoids new Date().toISOString() which is unreliable in SFMC SSJS.
*/
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

function addIfPresent(columns, values, columnName, value) {
    if (
        value !== null &&
        typeof value !== "undefined" &&
        String(value) !== ""
    ) {
        columns.push(columnName);
        values.push(value);
    }
}


/* =========================================
   Read BUMIDs from source DE
========================================= */

function getBusinessUnits() {
    /*
       SFMC stores Boolean DE fields as "True"/"False" (title case).
       Using "True" instead of "TRUE" to match correctly.
    */
    var rows = Platform.Function.LookupRows(
        SOURCE_DE,
        "IsActive",
        "True"
    );

    if (!rows || rows.length === 0) {
        throw new Error(
            "No active rows found in " +
            SOURCE_DE +
            ". Check the ENT. prefix and IsActive values."
        );
    }

    return rows;
}


/* =========================================
   Get OAuth token for a specific BU
========================================= */

function getAccessToken(buMid) {
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
            "OAuth failed for BUMID " +
            buMid +
            ". HTTP " +
            response.StatusCode +
            ": " +
            body
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

    return token;
}


/* =========================================
   Retrieve one journey page
========================================= */

function getJourneyPage(accessToken, restInstanceURL, pageNumber) {
    var endpoint =
        restInstanceURL +
        "interaction/v1/interactions" +
        "?$page=" + pageNumber +
        "&$pageSize=" + PAGE_SIZE +
        "&mostRecentVersionOnly=false";

    var request = new Script.Util.HttpRequest(endpoint);

    request.method = "GET";
    request.contentType = "application/json";
    request.emptyContentHandling = 0;
    request.continueOnError = true;
    request.retries = 2;

    request.setHeader(
        "Authorization",
        "Bearer " + accessToken
    );

    var response = request.send();

    if (
        response.statusCode < 200 ||
        response.statusCode >= 300
    ) {
        throw new Error(
            "Journey API failed. HTTP " +
            response.statusCode +
            ": " +
            response.content
        );
    }

    return Platform.Function.ParseJSON(
        String(response.content)
    );
}


/* =========================================
   Store one journey row
========================================= */

function saveJourney(buRow, journey) {
    var buMid = text(buRow["BUMID"]);
    var buName = text(buRow["BUName"]);

    var journeyID = text(
        firstValue(journey, ["id", "journeyId"])
    );

    var journeyKey = text(
        firstValue(journey, ["key", "journeyKey"])
    );

    var journeyName = text(
        firstValue(journey, ["name", "journeyName"])
    );

    var journeyStatus = text(
        firstValue(journey, ["status", "journeyStatus"])
    );

    var versionNumber = text(
        firstValue(journey, ["versionNumber", "version"])
    );

    var createdDate = formatDate(
        firstValue(journey, ["createdDate", "CreatedDate"])
    );

    var modifiedDate = formatDate(
        firstValue(journey, ["modifiedDate", "ModifiedDate"])
    );

    var definitionID = text(
        firstValue(journey, ["definitionId", "definitionID"])
    );

    var entrySourceType = text(
        firstValue(journey, [
            "entrySourceType",
            "entrySource",
            "definitionType"
        ])
    );

    if (!buMid || !journeyID || !versionNumber) {
        throw new Error(
            "Required field missing. " +
            "BUMID=" + buMid +
            ", JourneyID=" + journeyID +
            ", VersionNumber=" + versionNumber
        );
    }

    var keyColumns = [
        "BUMID",
        "JourneyID",
        "VersionNumber"
    ];

    var keyValues = [
        buMid,
        journeyID,
        versionNumber
    ];

    var updateColumns = [];
    var updateValues = [];

    addIfPresent(
        updateColumns,
        updateValues,
        "ExtractedDate",
        getCurrentDateString()
    );

    addIfPresent(
        updateColumns,
        updateValues,
        "BUName",
        buName
    );

    addIfPresent(
        updateColumns,
        updateValues,
        "JourneyKey",
        journeyKey
    );

    addIfPresent(
        updateColumns,
        updateValues,
        "JourneyName",
        journeyName
    );

    addIfPresent(
        updateColumns,
        updateValues,
        "JourneyStatus",
        journeyStatus
    );

    addIfPresent(
        updateColumns,
        updateValues,
        "CreatedDate",
        createdDate
    );

    addIfPresent(
        updateColumns,
        updateValues,
        "ModifiedDate",
        modifiedDate
    );

    addIfPresent(
        updateColumns,
        updateValues,
        "DefinitionID",
        definitionID
    );

    addIfPresent(
        updateColumns,
        updateValues,
        "EntrySourceType",
        entrySourceType
    );

    var result = Platform.Function.UpsertData(
        TARGET_DE,
        keyColumns,
        keyValues,
        updateColumns,
        updateValues
    );

    /*
       UpsertData returns the number of rows affected on success.
       A negative value or non-numeric result indicates failure.
    */
    if (typeof result === "number" && result < 0) {
        throw new Error(
            "UpsertData returned error code " + result +
            " for BUMID=" + buMid +
            ", JourneyID=" + journeyID +
            ", VersionNumber=" + versionNumber
        );
    }

    return result;
}


/* =========================================
   Main process
========================================= */

var buCount = 0;
var journeyCount = 0;
var savedCount = 0;
var errorCount = 0;
var errors = [];

try {
    var buRows = getBusinessUnits();

    buCount = buRows.length;

    for (var i = 0; i < buRows.length; i++) {
        var buRow = buRows[i];
        var buMid = text(buRow["BUMID"]);
        var buName = text(buRow["BUName"]);

        try {
            var token = getAccessToken(buMid);

            var pageNumber = 1;
            var continuePaging = true;

            while (continuePaging) {
                var journeyResponse = getJourneyPage(
                    token.access_token,
                    token.rest_instance_url,
                    pageNumber
                );

                var journeys = journeyResponse.items || [];

                if (journeys.length === 0) {
                    continuePaging = false;
                    break;
                }

                for (var j = 0; j < journeys.length; j++) {
                    journeyCount++;

                    try {
                        saveJourney(buRow, journeys[j]);
                        savedCount++;

                    } catch (saveError) {
                        errorCount++;

                        errors.push({
                            BUMID: buMid,
                            BUName: buName,
                            JourneyID: text(
                                firstValue(journeys[j], ["id", "journeyId"])
                            ),
                            Error: String(saveError)
                        });
                    }
                }

                if (journeys.length < PAGE_SIZE) {
                    continuePaging = false;
                } else {
                    pageNumber++;
                }
            }

        } catch (buError) {
            errorCount++;

            errors.push({
                BUMID: buMid,
                BUName: buName,
                Error: String(buError)
            });
        }
    }

    Write("<h2>Journey inventory process completed</h2>");
    Write("<p>BUs found: " + buCount + "</p>");
    Write("<p>Journeys received: " + journeyCount + "</p>");
    Write("<p>Rows inserted/updated: " + savedCount + "</p>");
    Write("<p>Errors: " + errorCount + "</p>");

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
        Error: String(fatalError),
        SourceDE: SOURCE_DE,
        TargetDE: TARGET_DE
    }));
    Write("</pre>");
}

</script>
