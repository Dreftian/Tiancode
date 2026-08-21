# Google NotebookLM Researcher Skill

This skill guides the agent on querying, researching, managing, and extracting grounded, citation-backed knowledge from **Google NotebookLM** using the `notebooklm-mcp` server.

## When to Use
- When the user asks to research questions based on their private Google NotebookLM notebooks, uploaded PDFs, documentation libraries, books, or research papers.
- When an inquiry requires 100% grounded answers with exact DOM/paragraph citations to avoid LLM hallucinations.
- When the user requests an **Audio Overview** (podcast-style two-host audio summary) of documents or notebooks.
- When organizing, searching, or indexing technical documentation in local/shared NotebookLM libraries.

## MCP Protocol & Toolset

The `notebooklm-mcp` server exposes the following tools:

### 1. Authentication & Health Check
- `get_health`: Verifies if the browser session is authenticated (`"authenticated": true`).
- `setup_auth`: Launches a browser window for first-time Google account login.
- `re_auth`: Clears stored cookies and restarts the authentication flow.

### 2. Notebook & Library Management
- `search_library`: Searches the user's registered local/cloud notebook library by topic, tag, or keyword.
- `add_notebook`: Adds a NotebookLM share URL to the active library:
  ```json
  {
    "url": "https://notebooklm.google.com/notebook/abcd-efgh",
    "name": "Project Documentation",
    "description": "Core architecture specs and API documentation",
    "topics": ["architecture", "backend", "effect"],
    "tags": ["docs", "v2"]
  }
  ```
- `list_notebooks`: Lists all available notebooks in the user's workspace.

### 3. Grounded Question Answering & Multi-Turn Sessions
- `ask_question`: Queries a specific notebook or active session.
  ```json
  {
    "question": "What is the recommended state management pattern for our session coordinator?",
    "session_id": "ses_abc123",
    "source_format": "inline"
  }
  ```
  - **Multi-turn continuity**: Always preserve and pass the returned `session_id` on follow-up questions to maintain conversational context and accelerate query execution.
  - **Citations (`source_format`)**:
    - `"inline"`: Embeds bracketed citation markers `[1]`, `[2]` linking directly to document references.
    - `"detailed"`: Appends complete source excerpts with document title and page/paragraph indexes.
- `reset_session`: Resets the conversational history of an active session while keeping the browser connection alive.
- `close_session`: Closes the session and releases browser resources.

### 4. Audio Overview Generation & Download
- `generate_audio_overview`: Triggers the generation of a two-host deep-dive audio discussion for the selected notebook.
- `get_audio_status`: Polls generation status (`pending`, `generating`, `ready`).
- `download_audio`: Downloads the completed audio overview MP3 to a local directory or playback cache.

## Workflow Best Practices
1. **Verify Connection**: Before querying, verify that `notebooklm` MCP is connected. If unauthenticated, guide the user to run `setup_auth`.
2. **Context Efficiency**: Prefer querying NotebookLM for large document collections (e.g. >50 pages) rather than reading massive raw files into the main prompt context.
3. **Transparent Citations**: Always present citations clearly to the user, highlighting the exact source document title and relevant quotes.
