# Repository Setup Instructions

## Branch Protection Rules

Once this repository is pushed to GitHub, configure the following branch protection rules for the `main` branch:

### Settings → Branches → Branch protection rules → Add rule

**Branch name pattern:** `main`

**Required settings:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: 0 (can be increased for team collaboration)
  - ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - Add status checks once CI is configured:
    - `lint`
    - `test-unit`
    - `test-integration`
    - `test-e2e`
    - `build`
- ✅ Do not allow bypassing the above settings

**Merge settings (in repository settings):**
- ✅ Allow squash merging (default)
- ❌ Allow merge commits (disable)
- ❌ Allow rebase merging (disable)

## Initial Push

```bash
# Add remote (replace with your GitHub repository URL)
git remote add origin https://github.com/YOUR_USERNAME/choice-chorus.git

# Push to GitHub
git push -u origin main
```

After pushing, configure the branch protection rules as described above.
