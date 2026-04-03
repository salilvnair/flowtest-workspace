# Zapper Electricity Disconnect - Consumer Pack

Consumer input is intentionally minimal.

## What consumer provides in `@flowtest start`

1. **Success Samples (1..N)**
   - Use files from `samples/success/`
2. **Failure Samples (0..N)**
   - Use files from `samples/failure/`
3. **AID (single file)**
   - `aid/zapper_api_aid.xlsx`
4. **HLD (single file)**
   - `docs/zapper_project_requirements.docx`

FlowTest will do heavy lifting later (spec normalization, mocks, DSL generation, execution/audit).

## Folder Structure

- `samples/success/` : happy-path sample payloads
- `samples/failure/` : failure-path sample payloads
- `aid/` : AID sheet (`.xlsx` + source `.csv`)
- `docs/` : HLD/requirements (`.docx` + source `.md`)

## Suggested first run

- Upload 3-5 success samples
- Upload 2-3 failure samples
- Upload AID + HLD
- Run `@flowtest start`
