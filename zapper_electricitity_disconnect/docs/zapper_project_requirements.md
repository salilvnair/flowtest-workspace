# Zapper Electricity Disconnect - Project Requirements (Simulation)

## Business Context
UPS enterprise customer submits an electricity disconnect request for two locations:
- UPS-TX-001 (Texas)
- UPS-NJ-002 (New Jersey)

## End-to-End Flow (Happy Path)
1. Address validation (API1)
2. Inventory validation (API2)
3. Pending bills validation (API3)
4. Disconnect submit (API4) returns transactionId + correlationId
5. After 30 seconds: callback API5 with disconnect order number
6. After additional intervals: async events
   - SOFT_DISCONNECT_DONE
   - RIPPED_OFF_WIRES
   - HARD_DISCONNECT_DONE

## Failure Path Coverage (Mandatory)

### API1 Address Validation
- Address mismatch for NJ site (`ADDR_MISMATCH`)
- Partial site mismatch while TX is valid

### API2 Inventory Validation
- Connection ID missing for TX site
- Transformer ID missing for NJ site
- Mixed asset failure across sites

### API3 Pending Bills
- Pending dues for one or both sites (`PENDING_BILLS_FOUND`)
- Billing system timeout / unavailable

### API4 Submit Disconnect
- Rejected due to pre-check failure (`PRECHECK_FAILED`)
- Duplicate active disconnect request (`DUPLICATE_DISCONNECT_REQUEST`)

### API5 Callback / Async
- Invalid correlation id callback (`UNKNOWN_CORRELATION_ID`)
- Out-of-order events (`EVENT_SEQUENCE_INVALID`)
- Final hard disconnect event missing (`HARD_DISCONNECT_EVENT_MISSING`)

## Non-Functional Requirements
- Full request trace by correlationId
- Event ordering validation
- Retry-safe processing for duplicate callbacks/events
- Deterministic audit trail for every step

## Test Expectations
- Validate all sync APIs return success and required keys in happy path
- Validate every documented failure scenario returns correct errorCode and message
- Validate callback/event sequence and timing windows
- Validate final hard disconnect completion event received

## Mocking Expectations
- Mock all downstream APIs/events for stable simulation
- Inject timeout/error scenarios for resilience tests

## Artifacts Expected From Agent
- Normalized API spec (with success + failure responses)
- WireMock mappings (success + failure scenarios)
- FlowTest DSL scenarios (happy + failure cases)
- Execution report + Allure evidence
