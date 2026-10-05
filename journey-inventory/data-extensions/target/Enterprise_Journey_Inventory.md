# Enterprise_Journey_Inventory

Target DE populated by the Journey inventory script.
One row per Journey version per Business Unit.

## Location
Shared Data Extensions (accessible via ENT. prefix from child BUs)

## Primary Key
BUMID + JourneyID + VersionNumber

## Columns

| Column          | Type | Length | PK  | Description                              |
|-----------------|------|--------|-----|------------------------------------------|
| BUMID           | Text | 50     | Yes | Business Unit MID                        |
| JourneyID       | Text | 100    | Yes | Unique Journey identifier                |
| VersionNumber   | Text | 10     | Yes | Journey version number                   |
| ExtractedDate   | Date | —      | No  | Date/time this row was last extracted    |
| BUName          | Text | 200    | No  | Business Unit display name               |
| JourneyKey      | Text | 200    | No  | Journey unique key                       |
| JourneyName     | Text | 500    | No  | Journey display name                     |
| JourneyStatus   | Text | 50     | No  | e.g. Active, Stopped, Draft              |
| CreatedDate     | Date | —      | No  | Date Journey version was created         |
| ModifiedDate    | Date | —      | No  | Date Journey version was last modified   |
| DefinitionID    | Text | 100    | No  | Journey definition identifier            |
| EntrySourceType | Text | 100    | No  | e.g. APIEvent, ContactEvent              |
