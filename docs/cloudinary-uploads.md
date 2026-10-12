# TIKKA image uploads

TIKKA uses a separate Cloudinary product environment from any other project.
The application scopes assets under `tikka/requests/<customer-id>/` and never
uses the browser for Cloudinary API secrets.

## Cloudinary setup

1. Create a separate Cloudinary product environment (or a separate Cloudinary
   account if you need stronger billing/access isolation).
2. Copy that environment's cloud name, API key, and API secret into the
   deployment environment. Do not commit them:

```text
TIKKA_CLOUDINARY_CLOUD_NAME=...
TIKKA_CLOUDINARY_API_KEY=...
TIKKA_CLOUDINARY_API_SECRET=...
TIKKA_CLOUDINARY_FOLDER=tikka/requests
```

3. Run the database migration:

```text
npm run db:migrate
```

The upload flow uses signed uploads, authenticated Cloudinary assets, a
1600x1200 maximum incoming transformation, and automatic quality. Signed
delivery URLs are generated server-side only after the request ownership check.

## Orphan cleanup

Uploads are registered as pending before the browser sends the file. The UI
releases them when submission fails, and a scheduled cleanup should run daily
as a backstop:

```text
npm run cleanup:uploads
```

The cleanup command deletes pending records older than 24 hours from Cloudinary
and PostgreSQL/JSON storage. It must run with the same `TIKKA_CLOUDINARY_*`
variables and storage/database configuration as the application.

The backend enforces the six-image limit, JPG/PNG/WebP types, 8 MB per image,
attachment ownership, and one-time attachment linking. PostgreSQL stores
Cloudinary identifiers and metadata, not base64 image contents.
