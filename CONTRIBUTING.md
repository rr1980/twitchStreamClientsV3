# Contributing

Thanks for contributing to Twitch Stream Clients V3.

## Before You Start

- Use a current Node.js 22+ and npm 11+ setup
- Install dependencies with `npm install`
- Prefer small, focused changes instead of broad refactors
- Keep the existing Angular 21 standalone and signals-based architecture intact

## Local Checks

Before opening a pull request, run:

```bash
npm run lint
npm test
npm run test:coverage:ci
```

## Code Guidelines

- Follow the existing code style and file structure
- Keep components focused and use Angular signals and computed state where appropriate
- Add or update tests for behavior changes
- Avoid unrelated cleanup in the same pull request
- Keep user-facing copy consistent with the current German UI unless the change explicitly updates localization

## Pull Requests

- Describe what changed and why
- Mention any behavior changes that affect users
- Call out follow-up work if something is intentionally left out
- Include screenshots or short recordings for visible UI changes when helpful
- Use the repository's issue and pull request templates when applicable

## Scope Notes

- This project stores all user state in the browser and has no backend
- The repository code is MIT-licensed, but Twitch branding, trademarks, and streamed content are not covered by that license