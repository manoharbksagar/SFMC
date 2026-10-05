<script runat="server">

Platform.Load("Core", "1");

/* =========================================
   Configuration
========================================= */

var AUTH_BASE_URI =
    "https://SFMC_DOMAIN.auth.marketingcloudapis.com";

var CLIENT_ID = "XXXXXXXXXXXXXXXXXXX";
var CLIENT_SECRET = "XXXXXXXXXXXXXXXXXXXXXXX";

/*
   ENT. prefix required when running from a child BU.
   Remove ENT. if running from the Parent/Enterprise BU.
*/
var SOURCE_DE = "ENT.BusinessUnit_CountryCode";
var TARGET_DE = "ENT.Enterprise_CloudPage_Inventory";

var PAGE_SIZE = 50;

var CLOUDPAGE_ASSET_TYPES = [
    240, 241, 242, 243, 244, 245, 247, 248, 249
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

function nestedText(object, keys) {
    var current = object;
    for (var i = 0; i < keys.length; i++) {
        if (
            current === null ||
            typeof current === "undefined" ||
            typeof current !== "object"
        ) {
            return "";
        }
        current = current[keys[i]];
    }
    if (current === null || typeof current === "undefined") {
        return "";
    }
    return String(current);
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
   Retrieve one Cloud Page query page
   Uses POST /asset/v1/content/assets/query
   "content" field added — it is a JSON string
   containing the published URL.
========================================= */

function getCloudPagePage(accessToken, restInstanceURL, pageNumber) {
    var endpoint = restInstanceURL + "asset/v1/content/assets/query";

    var payload = {
        "page": {
            "pageSize": PAGE_SIZE,
            "page": pageNumber
        },
        "query": {
            "property": "assetType.id",
            "simpleOperator": "in",
            "values": CLOUDPAGE_ASSET_TYPES
        },
        "fields": [
            "id",
            "customerKey",
            "objectID",
            "name",
            "assetType",
            "status",
            "content",
            "createdDate",
            "createdBy",
            "modifiedDate",
            "modifiedBy",
            "category",
            "meta"
        ],
        "sort": [
            {
                "property": "modifiedDate",
                "direction": "DESC"
            }
        ]
    };

    var request = new Script.Util.HttpRequest(endpoint);

    request.method = "POST";
    request.contentType = "application/json";
    request.emptyContentHandling = 0;
    request.continueOnError = true;
    request.retries = 2;

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
            "Cloud Page API failed. HTTP " +
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
   Store one Cloud Page row
========================================= */

function saveCloudPage(buRow, page) {
    var buMid           = text(buRow["BUMID"]);
    var buName          = text(buRow["BUName"]);
    var cloudPageID     = text(page["id"]);
    var objectID        = text(page["objectID"]);
    var customerKey     = text(page["customerKey"]);
    var pageName        = text(page["name"]);
    var assetTypeID     = nestedText(page, ["assetType", "id"]);
    var assetTypeName   = nestedText(page, ["assetType", "name"]);
    var statusID        = nestedText(page, ["status", "id"]);
    var createdDate     = formatDate(text(page["createdDate"]));
    var createdByEmail  = nestedText(page, ["createdBy", "email"]);
    var modifiedDate    = formatDate(text(page["modifiedDate"]));
    var modifiedByEmail = nestedText(page, ["modifiedBy", "email"]);
    var folderID        = nestedText(page, ["category", "id"]);
    var folderName      = nestedText(page, ["category", "name"]);
    var folderParentID  = nestedText(page, ["category", "parentId"]);

    /*
       URL lives inside the "content" field which is a JSON string.
       Parse it and extract .url
    */
    var publishedURL = "";

    try {
        var contentStr = text(page["content"]);

        if (contentStr !== "") {
            var contentObj = Platform.Function.ParseJSON(contentStr);

            if (
                contentObj !== null &&
                typeof contentObj !== "undefined" &&
                contentObj["url"] !== null &&
                typeof contentObj["url"] !== "undefined"
            ) {
                publishedURL = text(contentObj["url"]);
            }
        }
    } catch (contentErr) {
        /* content is not valid JSON for some asset types — skip */
    }

    /*
       Published date is at meta.cloudPages.publishDate.
       If publishDate exists the page has been published at least once.
    */
    var publishedDate = "";
    var isPublished   = "False";
    var statusName    = "Unpublished";

    if (
        page["meta"] !== null &&
        typeof page["meta"] !== "undefined" &&
        page["meta"]["cloudPages"] !== null &&
        typeof page["meta"]["cloudPages"] !== "undefined"
    ) {
        var cloudPagesMeta = page["meta"]["cloudPages"];

        var rawDate =
            cloudPagesMeta["publishDate"]   ||
            cloudPagesMeta["publishedDate"] ||
            "";

        publishedDate = formatDate(text(rawDate));

        if (publishedDate !== "") {
            isPublished = "True";
            statusName  = "Published";
        }
    }

    if (!buMid || !cloudPageID) {
        throw new Error(
            "Required field missing. " +
            "BUMID=" + buMid +
            ", CloudPageID=" + cloudPageID
        );
    }

    var keyColumns = ["BUMID", "CloudPageID"];
    var keyValues  = [buMid, cloudPageID];

    var updateColumns = [];
    var updateValues  = [];

    addIfPresent(updateColumns, updateValues, "ExtractedDate",   getCurrentDateString());
    addIfPresent(updateColumns, updateValues, "BUName",          buName);
    addIfPresent(updateColumns, updateValues, "ObjectID",        objectID);
    addIfPresent(updateColumns, updateValues, "CustomerKey",     customerKey);
    addIfPresent(updateColumns, updateValues, "CloudPageName",   pageName);
    addIfPresent(updateColumns, updateValues, "AssetTypeID",     assetTypeID);
    addIfPresent(updateColumns, updateValues, "AssetTypeName",   assetTypeName);
    addIfPresent(updateColumns, updateValues, "StatusID",        statusID);
    addIfPresent(updateColumns, updateValues, "StatusName",      statusName);
    addIfPresent(updateColumns, updateValues, "IsPublished",     isPublished);
    addIfPresent(updateColumns, updateValues, "CreatedDate",     createdDate);
    addIfPresent(updateColumns, updateValues, "CreatedBy",       createdByEmail);
    addIfPresent(updateColumns, updateValues, "ModifiedDate",    modifiedDate);
    addIfPresent(updateColumns, updateValues, "ModifiedBy",      modifiedByEmail);
    addIfPresent(updateColumns, updateValues, "FolderID",        folderID);
    addIfPresent(updateColumns, updateValues, "FolderName",      folderName);
    addIfPresent(updateColumns, updateValues, "FolderParentID",  folderParentID);
    addIfPresent(updateColumns, updateValues, "PublishedDate",   publishedDate);
    addIfPresent(updateColumns, updateValues, "PublishedURL",    publishedURL);

    var result = Platform.Function.UpsertData(
        TARGET_DE,
        keyColumns,
        keyValues,
        updateColumns,
        updateValues
    );

    if (typeof result === "number" && result < 0) {
        throw new Error(
            "UpsertData returned error code " + result +
            " for BUMID=" + buMid +
            ", CloudPageID=" + cloudPageID
        );
    }

    return result;
}


/* =========================================
   Main process
========================================= */

var buCount    = 0;
var pageCount  = 0;
var savedCount = 0;
var errorCount = 0;
var errors     = [];

try {
    var buRows = getBusinessUnits();

    buCount = buRows.length;

    for (var i = 0; i < buRows.length; i++) {
        var buRow  = buRows[i];
        var buMid  = text(buRow["BUMID"]);
        var buName = text(buRow["BUName"]);

        try {
            var token = getAccessToken(buMid);

            var pageNumber     = 1;
            var continuePaging = true;

            while (continuePaging) {
                var apiResponse = getCloudPagePage(
                    token.access_token,
                    token.rest_instance_url,
                    pageNumber
                );

                var pages = apiResponse.items || [];

                if (pages.length === 0) {
                    continuePaging = false;
                    break;
                }

                for (var j = 0; j < pages.length; j++) {
                    pageCount++;

                    try {
                        saveCloudPage(buRow, pages[j]);
                        savedCount++;

                    } catch (saveError) {
                        errorCount++;

                        errors.push({
                            BUMID:       buMid,
                            BUName:      buName,
                            CloudPageID: text(pages[j]["id"]),
                            PageName:    text(pages[j]["name"]),
                            Error:       String(saveError)
                        });
                    }
                }

                if (pages.length < PAGE_SIZE) {
                    continuePaging = false;
                } else {
                    pageNumber++;
                }
            }

        } catch (buError) {
            errorCount++;

            errors.push({
                BUMID:  buMid,
                BUName: buName,
                Error:  String(buError)
            });
        }
    }

    Write("<h2>Cloud Page inventory process completed</h2>");
    Write("<p>BUs found: "             + buCount    + "</p>");
    Write("<p>Cloud Pages received: "  + pageCount  + "</p>");
    Write("<p>Rows inserted/updated: " + savedCount + "</p>");
    Write("<p>Errors: "                + errorCount + "</p>");

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
        SourceDE: SOURCE_DE,
        TargetDE: TARGET_DE
    }));
    Write("</pre>");
}

</script>
