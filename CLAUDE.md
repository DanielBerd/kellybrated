# Repo conventions for Claude

- Commit directly to `main` — do not create feature branches. GitHub Pages
  deploys from `main` on every push, and the owner tests against the live site.
- Credit commits to both Claude and the repo owner: keep author/committer as
  `Claude <noreply@anthropic.com>` (required for GitHub's Verified badge) and
  end every commit message with:

  ```
  Co-authored-by: Daniel <daniel.ber@outlook.com>
  ```
