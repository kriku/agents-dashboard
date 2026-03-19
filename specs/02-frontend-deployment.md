# Frontend Deployment — CDN + S3

The dashboard frontend is a static React SPA. It is deployed to object storage (S3/GCS) and served globally via a CDN with push-based cache invalidation on every release.

---

## Architecture

```
  monitoring.example.com              api.monitoring.example.com
          │                                     │
  ┌───────▼────────┐                  ┌─────────▼──────────┐
  │  CloudFront    │                  │ K8s Ingress / ALB  │
  │  Distribution  │                  │ (public, HTTPS)    │
  └───────┬────────┘                  └─────────┬──────────┘
          │                                     │
  ┌───────▼────────┐                  ┌─────────▼──┐
  │  S3 Bucket     │◀── CI/CD push   │ BFF pods   │
  │  (OAC)         │                  └────────────┘
  └────────────────┘
```

The frontend and API are served from **separate domains**:

- **`monitoring.example.com`** — CloudFront distribution with a single S3 origin. Serves static assets via Origin Access Control (OAC). The bucket is private; only CloudFront can read from it.
- **`api.monitoring.example.com`** — BFF ALB directly. The frontend connects to this domain for all API calls via the `VITE_API_BASE_URL` environment variable. No CDN proxying — API requests go straight to the BFF.

---

## S3 Bucket

```
s3://dashboard-frontend-{env}/
├── index.html                          # entry point (short cache)
├── assets/
│   ├── index-{hash}.js                 # Vite content-hashed bundle
│   ├── index-{hash}.css                # Vite content-hashed styles
│   └── vendor-{hash}.js                # split chunks (if code-split)
├── favicon.ico
└── 404.html
```

### Bucket Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CDNReadAccess",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::dashboard-frontend-prod/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT:distribution/DIST_ID"
        }
      }
    }
  ]
}
```

- **Block all public access** — the bucket is private. Only the CDN reads from it via Origin Access Control (OAC).
- **Versioning enabled** — allows instant rollback by re-pointing the CDN to a previous version.
- **Lifecycle rule** — expire non-current versions after 30 days.

---

## CDN Configuration (CloudFront)

### Behaviors

| Path Pattern | Origin | Cache Policy | Forwarded to Origin | Notes |
|---|---|---|---|---|
| `/assets/*` | S3 bucket | 1 year (`max-age=31536000, immutable`) | — | Content-hashed, safe to cache forever |
| `/*` (default) | S3 bucket | Short TTL (`max-age=60, s-maxage=300`) | — | `index.html` — must pick up new asset hashes on deploy |

API requests (`/api/*`) are **not routed through CloudFront**. The frontend calls the BFF directly at `api.monitoring.example.com` via the `VITE_API_BASE_URL` environment variable.

### Cache Headers (set by CI/CD on S3 upload)

```bash
# Content-hashed assets — cache forever
aws s3 sync dist/assets/ s3://$BUCKET/assets/ \
  --cache-control "public, max-age=31536000, immutable" \
  --content-encoding identity

# index.html — short cache, always revalidated
aws s3 cp dist/index.html s3://$BUCKET/index.html \
  --cache-control "public, max-age=60, s-maxage=300, must-revalidate"

# Other root files (favicon, 404.html, etc.)
aws s3 sync dist/ s3://$BUCKET/ \
  --exclude "assets/*" --exclude "index.html" \
  --cache-control "public, max-age=3600"
```

### SPA Routing

CloudFront custom error response: return `/index.html` with status 200 for any 403/404 from S3. This enables client-side routing (React Router) for paths like `/tool-call-performance`.

| HTTP Error Code | Response Page | Response Code | TTL |
|---|---|---|---|
| 403 | `/index.html` | 200 | 0s |
| 404 | `/index.html` | 200 | 0s |

### Security Headers (CloudFront Response Headers Policy)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.monitoring.example.com; img-src 'self' data:;
```

---

## CORS Requirements (BFF)

Since the frontend (`monitoring.example.com`) and BFF (`api.monitoring.example.com`) are on different origins, the BFF must set CORS headers on all responses:

```
Access-Control-Allow-Origin: https://monitoring.example.com
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, Accept
Access-Control-Max-Age: 3600
```

- The BFF should validate the `Origin` header against an allowlist (one entry per environment).
- `Access-Control-Allow-Credentials` is not needed — the frontend sends JWTs via the `Authorization` header, not cookies.
- Preflight (`OPTIONS`) responses should be fast and cacheable (`Access-Control-Max-Age: 3600`).

---

## Push-Based Deployment (CI/CD)

Every merge to `main` triggers a deploy. The pipeline pushes assets to S3, then invalidates the CDN — browsers pick up the new version on next navigation.

### Pipeline Steps

```
1. npm ci
2. npm run build            # Vite produces dist/ with content-hashed filenames
3. npm run test             # vitest run
4. Upload assets first      # new hashed files, won't be referenced yet
5. Upload index.html        # points to new hashed assets — atomic switchover
6. Invalidate CDN           # purge index.html from edge caches
7. Smoke test               # curl the CDN, verify new version tag
```

### Deploy Script

```bash
#!/usr/bin/env bash
set -euo pipefail

BUCKET="dashboard-frontend-${ENV:-prod}"
DIST_ID="${CDN_DISTRIBUTION_ID}"
VERSION=$(git rev-parse --short HEAD)

echo "Deploying ${VERSION} to s3://${BUCKET}"

# 1. Upload content-hashed assets (safe — no conflicts with old version)
aws s3 sync dist/assets/ "s3://${BUCKET}/assets/" \
  --cache-control "public, max-age=31536000, immutable" \
  --delete

# 2. Upload root files except index.html
aws s3 sync dist/ "s3://${BUCKET}/" \
  --exclude "assets/*" --exclude "index.html" \
  --cache-control "public, max-age=3600"

# 3. Upload index.html last (atomic switchover)
aws s3 cp dist/index.html "s3://${BUCKET}/index.html" \
  --cache-control "public, max-age=60, s-maxage=300, must-revalidate" \
  --metadata "x-deploy-version=${VERSION}"

# 4. Invalidate index.html at CDN edge
aws cloudfront create-invalidation \
  --distribution-id "${DIST_ID}" \
  --paths "/index.html" "/404.html"

echo "Deployed ${VERSION}, invalidation submitted"
```

### Rollback

Rollback is a re-deploy of the previous commit. Since old content-hashed assets are still in S3 (not deleted until lifecycle expiry), re-uploading the old `index.html` instantly switches back.

```bash
git revert HEAD && git push   # triggers normal deploy pipeline
```

For emergency rollback without a new commit, copy the previous `index.html` from S3 versioning:

```bash
# List previous versions of index.html
aws s3api list-object-versions --bucket $BUCKET --prefix index.html

# Restore specific version
aws s3api copy-object \
  --bucket $BUCKET --key index.html \
  --copy-source "${BUCKET}/index.html?versionId=${PREVIOUS_VERSION_ID}"

aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/index.html"
```

---

## Environments

| Environment | S3 Bucket | CDN Domain | API Domain (`VITE_API_BASE_URL`) | Deploy Trigger |
|---|---|---|---|---|
| Production | `dashboard-frontend-prod` | `monitoring.example.com` | `https://api.monitoring.example.com` | Merge to `main` |
| Staging | `dashboard-frontend-staging` | `staging.monitoring.example.com` | `https://api.staging.monitoring.example.com` | Push to `staging` branch |
| Preview | `dashboard-frontend-pr-{N}` | `pr-{N}.monitoring.example.com` | `https://api.staging.monitoring.example.com` | PR opened/updated |

Preview environments use temporary S3 buckets and CDN behaviors, cleaned up when the PR is closed.

---

## Cost Profile

| Resource | Estimated Monthly Cost | Notes |
|---|---|---|
| S3 storage | < $1 | ~2MB build output |
| CloudFront requests | ~$5–20 | Depends on user count |
| CloudFront data transfer | ~$5–50 | ~500KB first load, ~5KB incremental |
| **Total** | **~$10–70** | vs. 2 nginx pods + LB: ~$50–100/mo |

Eliminates: Kubernetes pods, container registry, nginx config, pod scaling, liveness probes, node affinity.
