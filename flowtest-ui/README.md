# FlowTest UI (Next.js)

Standalone UI for FlowTest run center + live timeline with the same visual language as the VS Code panel.

## Run

```bash
cd /Users/salilvnair/workspace/git/salilvnair/flowtest-workspace/flowtest-ui
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3006](http://localhost:3006).

## API routes

- `POST /api/llm`
  - Proxies to OpenAI or LM Studio based on `FLOWTEST_LLM_PROVIDER`.
- `POST /api/engine/run`
  - Proxies to FlowTest engine `POST {FLOWTEST_ENGINE_BASE_URL}/api/scenarios/run-temporal`.
- `GET /api/health`
  - UI health endpoint.

## Notes

- Current dashboard uses seeded timeline/meta data so design can be iterated quickly.
- Next integration step is wiring websocket/SSE or poll endpoints from engine for live run updates.
