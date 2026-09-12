# One file per change

Write what a person using Daylo should know, in the same voice as `CHANGELOG.md`: a bold
lead sentence saying what changed, then what it was like before and why it is better. No
version headings here, and nothing about pull requests, branches or internals.

Name the file after the pull request it belongs to:

```
changelog.d/54-stop-a-tap-from-leaving-a-ring-behind.md
```

The number decides the order the paragraphs are read in when the release is put together,
so a release reads in the order its changes landed.

At release time `node scripts/collect-changelog.js 1.3.0` joins them into a new section of
`CHANGELOG.md` and empties this directory.

## Why the file and not the changelog directly

Two branches writing paragraphs into the same section of the same file collide every time.
While 1.2 was being assembled that happened three times in one day, and each collision cost
a merge, a resolution, and another full run of the checks on a pull request that was
already approved. Separate files cannot collide.

Not every change needs one. A refactor nobody can see, a test, a workflow: those are for
the commit message, not for the person who opens the app.
