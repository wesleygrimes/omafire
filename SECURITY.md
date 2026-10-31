# Security policy

## Supported versions

Only the latest commit on `main` gets security fixes.

## Report a vulnerability

Use GitHub private vulnerability reporting: **Security** > **Report a vulnerability**,
or open the [private report form](https://github.com/wesleygrimes/omafire/security/advisories/new).
Don't open public issues for vulnerabilities.

Include your OmaFire commit, steps to reproduce, and what an attacker could do.

OmaFire has a solo maintainer. Responses are best effort, with an aim to
acknowledge reports within about a week. Fixes credit the reporter unless they
prefer otherwise.

## What OmaFire touches

OmaFire makes no network requests and runs no background service. It reads its
own files and writes one state file, `$XDG_STATE_HOME/omafire/state.json`.
A change that adds network access, runs commands, or reads or deletes files
outside that path gets extra review.
