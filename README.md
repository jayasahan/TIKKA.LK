# TIKKA

TIKKA is a Sri Lankan handyman and skilled-services outsourcing platform.

## Repository Layout

- `apps/platform/` - the current deployable TIKKA platform application, including the Node server, static HTML/CSS/JS, public assets, local data, scripts, and runtime storage directory.
- `packages/` - reserved for future shared packages. No shared package exists yet.
- `infra/` - reserved for future Docker, cloud, and CI infrastructure.

## Local Startup

From the repository root:

```powershell
cmd /c npm install
cmd /c npm start
```

The platform starts at:

```text
http://localhost:3000
```

Local environment configuration can be placed in a root `.env` file based on `.env.example`.
