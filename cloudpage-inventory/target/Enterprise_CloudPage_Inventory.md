# Enterprise_CloudPage_Inventory

Target DE populated by the Cloud Page inventory script.
One row per Cloud Page per Business Unit.

## Location
Shared Data Extensions (accessible via ENT. prefix from child BUs)

## Primary Key
BUMID + CloudPageID

## Columns

| Column        | Type | Length | PK  | Description                                      |
|---------------|------|--------|-----|--------------------------------------------------|
| BUMID         | Text | 50     | Yes | Business Unit MID                                |
| CloudPageID   | Text | 50     | Yes | Unique asset ID from the Asset API               |
| ExtractedDate | Date | —      | No  | Date/time this row was last extracted            |
| BUName        | Text | 200    | No  | Business Unit display name                       |
| ObjectID      | Text | 100    | No  | Asset GUID                                       |
| CustomerKey   | Text | 200    | No  | Unique string key for the asset                  |
| CloudPageName | Text | 500    | No  | Cloud Page display name                          |
| AssetTypeID   | Text | 10     | No  | Numeric asset type (240-249)                     |
| AssetTypeName | Text | 100    | No  | e.g. webpage, microsite                          |
| StatusID      | Text | 10     | No  | Asset status ID from Content Builder             |
| StatusName    | Text | 50     | No  | Published / Unpublished                          |
| IsPublished   | Text | 10     | No  | True / False — derived from meta.cloudPages      |
| CreatedDate   | Date | —      | No  | Date asset was created                           |
| CreatedBy     | Text | 200    | No  | Email of user who created the page               |
| ModifiedDate  | Date | —      | No  | Date asset was last modified                     |
| ModifiedBy    | Text | 200    | No  | Email of user who last modified the page         |
| FolderID      | Text | 50     | No  | Content Builder folder ID                        |
| FolderName    | Text | 200    | No  | Content Builder folder name                      |
| FolderParentID| Text | 50     | No  | Parent folder ID                                 |
| PublishedDate | Date | —      | No  | Date page was last published                     |
| PublishedURL  | Text | 500    | No  | Live URL of the published Cloud Page             |
