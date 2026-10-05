## Location
Shared Data Extensions (accessible via ENT. prefix from child BUs)

## Primary Key
BUMID

## Columns

| Column    | Type    | Length | Required | Description                              |
|-----------|---------|--------|----------|------------------------------------------|
| BUMID     | Text    | 50     | Yes (PK) | Business Unit MID                        |
| BUName    | Text    | 200    | Yes      | Business Unit display name               |
| CountryCode | Text  | 10     | No       | Country code associated with the BU      |
| IsActive  | Boolean | —      | Yes      | Set to True to include BU in extraction  |
