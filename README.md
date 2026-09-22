# FooIDB

FooIDB is a modern web application for designing, visualizing, and exporting database schemas with AI-assisted workflows. It helps teams accelerate database planning, entity relationship modeling, and SQL/diagram generation from structured ideas or existing schema logic.

<img width="1767" height="941" alt="image" src="https://github.com/user-attachments/assets/1257d0df-7eef-474b-b3f1-3ea16017f210" />

## Overview

FooIDB combines a database editor, visual diagram builder, and AI-powered suggestions into one workflow. Users can define entities, relationships, and attributes, then transform the result into a schema representation or export-ready diagram.

The application is built with Next.js and includes Google authentication, Google Drive integration, and AI-assisted relationship and method generation powered by Gemini.

## Key Features

- Database schema modeling with table and relationship management
- Visual editor for diagram-based database design
- SQL and UML-oriented workflow support
- AI-assisted relationship and method generation
- Draw.io-compatible export flow
- Google OAuth login for authenticated access
- Google Drive integration for saving and reading project files
- Responsive interface for desktop and mobile workflows

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- NextAuth
- Google APIs
- Gemini AI integration
- ELK layout engine for diagram layouting
- Monaco Editor for editing workflows

## Typical Workflow

1. Open the dashboard and create or import a database structure.
2. Define tables, columns, and relationships.
3. Use AI-generated methods or relationship suggestions when needed.
4. Preview the design in the visual editor.
5. Export the result for documentation or downstream tooling.

## Project Structure

```text
app/
  api/
    auth/
    drive/
    generate-methods/
    generate-relations/
    validate-key/
  dashboard/
  editor/
components/
  editor/
  preview/
lib/
  ai/
  drive/
  export/
  layout/
  parser/
  xml/
store/
  dbStore.ts
types/
```

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm or pnpm
- A Google Cloud project for OAuth credentials
- A Gemini API key for AI features

### Installation

```bash
npm install
```

### Run the app locally

```bash
npm run dev
```

Open http://localhost:3000 in the browser.

## Environment Variables

Create a `.env.local` file in the project root and add the following values:

```env
AUTH_SECRET=your_secret_key
AUTH_GOOGLE_ID=your_google_client_id
AUTH_GOOGLE_SECRET=your_google_client_secret
```

Notes:

- `AUTH_SECRET` is required for NextAuth session security.
- `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are used for Google sign-in.
- The Gemini API key is used from the app UI on the client side for AI features.

## Authentication and Drive Integration

The application uses Google OAuth for authentication and requests Drive access to support reading and saving project files. The provider configuration is defined in the auth setup and uses the Google OAuth flow with Drive file permissions.

## Development Notes

- The main app logic is centered in the dashboard and editor workflows.
- AI endpoints live under the `app/api` folder.
- State management for the database model is handled in `store/dbStore.ts`.
- Export and XML generation logic is organized under `lib/export` and `lib/xml`.

## Preview
<img width="1861" height="937" alt="image" src="https://github.com/user-attachments/assets/cd785594-d3d5-44d1-aa8b-3de7fe739633" />
<img width="1865" height="945" alt="image" src="https://github.com/user-attachments/assets/922e42ee-9d22-47ea-81a8-bed510043bdb" />


## Notes

This project is designed as a flexible database design tool for prototyping, documentation, and rapid schema planning. It is intentionally structured so the editor, export layer, and AI features can evolve independently.
