# Oracle Property Intelligence Platform Pipeline - Rock Island County, IL

## Context

The Oracle ingestion pipeline has been started, but the full Rock Island County, IL dataset has not been completely uploaded, reconciled, or demonstrated. The infrastructure must be designed so Oracle does not carry ongoing infrastructure cost by default. For this candidate exercise, the candidate acts as both Oracle and builder: they are responsible for completing the pipeline and proving the low-cost infrastructure approach.
In addition to standard property intelligence, the pipeline must surface signals relevant to data-center site selection (parcel size, ownership stability, zoning/permit history, proximity to power infrastructure, and related public data).

## Description

Complete the Oracle pipeline by loading all available Rock Island County, IL property, permit, ownership, business, contractor, location, and public-source data into an MCP-ready database. Use IPFS and DuckDB to minimize Oracle-hosted infrastructure costs while enabling UI and agent access to answer both general property intelligence questions and data-center suitability questions.

## Acceptance Criteria
- Run the Oracle pipeline until all available county data is uploaded.
- Confirm the pipeline covers Rock Island County, Illinois.
- Load available property records into the database.
- Load available permit records into the database.
- Load available ownership records into the database.
- Load available contractor records into the database.
- Load available business records into the database.
- Load available location and coordinate data into the database.
- Ingest or link any publicly available zoning, land-use, or utility-related data that can support data-center site evaluation.
- Reconcile duplicate entities across all uploaded datasets.
- Preserve source provenance for uploaded records.
- Optimize pipeline performance where feasible.
- Identify slow source sites or constrained data sources.
- Document pipeline speed limitations and source constraints.
- Design the infrastructure so Oracle does not carry ongoing infrastructure cost by default.
- Use IPFS for decentralized storage of eligible dataset artifacts.
- Use DuckDB for local or portable analytical querying.
- Structure the database to support MCP access.
- Enable agent access to query the database.
- Provide a UI for exploring the uploaded data.
- Support questions about properties with roofs older than 15 years.
- Support questions about properties with a view of water.
- Support questions about properties that have not exchanged ownership in more than 10 years.
- Support questions about properties with regional (or out-of-area) owners.
- Support questions about properties within walking distance of public transportation using property coordinates.
- Support questions about properties within walking distance of Starbucks using property coordinates.
- Support data-center–relevant queries, including:
  - Parcels or assemblages above a configurable acreage threshold
  - Ownership stability (long tenure / low turnover)
  - Proximity to known or candidate power infrastructure (where public data exists)
  - Relevant permit or zoning history that may affect industrial / data-center use
- Return source-backed answers where source data is available.
- Demonstrate the uploaded dataset through the UI.
- Demonstrate the uploaded dataset through an agent query.
- Demonstrate that Oracle can operate without carrying the infrastructure cost.
- Confirm the candidate fulfilled both Oracle and builder responsibilities for this milestone.
- Pass the demo using real uploaded Rock Island County records.

## Demo Transcript
- Presenter: “I will demonstrate that the Oracle pipeline has loaded the full available dataset for Rock Island County, Illinois, that the data is queryable through DuckDB, that eligible artifacts are stored through IPFS, and that both the UI and agent can answer property intelligence and data-center suitability questions.”
- Presenter: “First, I am opening the pipeline run summary.”
  - Expected Result: The system displays the completed pipeline run, source list, record counts, timestamps, and any documented source limitations.
- Presenter: “Show the total uploaded records by source.”
  - Expected Result: The system shows uploaded property, permit, ownership, contractor, business, and coordinate records with collection timestamps and provenance.
- Presenter: “Now I am opening the DuckDB-backed query layer.”
  - Expected Result: The system confirms that the loaded data is available for structured querying without requiring Oracle-hosted database infrastructure.
- Presenter: “Show the IPFS artifacts created for the uploaded datasets.”
  - Expected Result: The system displays IPFS references or content identifiers for eligible dataset artifacts.
- Presenter: “Using the UI, show properties that have not exchanged ownership in more than 10 years and that meet a minimum acreage threshold suitable for data-center consideration.”
  - Expected Result: Matching properties are returned with supporting ownership history, acreage, and source provenance.
- Presenter: “Show properties near candidate power infrastructure or with relevant industrial/zoning signals where data is available.”
  - Expected Result: Results are returned with the geographic or permit basis clearly identified.
- Presenter: “Now I am asking the same type of questions through the agent.”
  - Agent Prompt: “Which larger parcels in Rock Island County have stable ownership (no recorded transfer in the last 10+ years) and any available signals related to power or industrial suitability?”
    - Expected Result: The agent returns matching properties, explains the reasoning, and includes source-backed evidence.
  - Agent Prompt: “Which properties appear to be strong candidates for further data-center review based on size, ownership age, and location/power signals?”
    - Expected Result: The agent returns a ranked or filtered list using available data and clearly identifies any assumptions or missing data.
- Presenter: “Finally, I will show that the system is MCP-ready.”
  - Expected Result: The system demonstrates an MCP-ready interface or documented MCP-compatible query structure that agents can use without changing the data model.UI 

## Reference
- [Soofi XYZ Team Kit](https://github.com/soofi-xyz/soofi-xyz-team-kit)
- [Elephant Oracle Skills](https://github.com/elephant-xyz/skills)
