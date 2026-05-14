# Object Storage

## Description
File and media storage integration via ObjectStorage. Covers upload/download presigned URLs, bucket management, database object_key storage pattern, and web-sdk client.storage APIs for managing files, images, and videos.

## Guide

### ObjectStorage Integration
- [Critical] When object information needs to be saved in the database table
  - Generate the object_key of the object
  - Get the upload presigned URL through object_key using web-sdk `client.storage.getUploadUrl({ bucket_name, object_key })` (or use `client.storage.upload(...)`)
  - The frontend uploads the object through the upload presigned URL, and ONLY saves the object_key and visibility(public/private) into the database table, DON't save upload/download presigned URL.
  - When previewing or downloading an object from the database table, use `client.storage.getDownloadUrl({ bucket_name, object_key })` (or `client.storage.download(...)`) to obtain the download presigned URL
- The ObjectStorage implemented inside the `backend/routers/storage.py` and `backend/services/storage.py`. Don't Modify these files.
- Use web-sdk Storage Module `client.storage.*` to call storage apis and use `response.data` to access response body like `response.data.download_url`.
- Strictly follow the route, request and response format of the ObjectStorage API Endpoints
  - Using a download presigned URL through the object_key, open the save file dialog and allow the user to save the file locally

#### web-sdk Storage APIs
- Notes: `?` optional; `visibility`: 'public'|'private'; `object_key`: path string; `overwrite_key`: bool overwrite target; `size`: bytes; `*_at/last_modified`: 'YYYY-MM-DD HH:mm:ss'; `etag`: ETag; `file`: browser File; `accept`: input accept
- `createBucket({ bucket_name, visibility })` -> `{ bucket_name, visibility, created_at }`
- `listBuckets()` -> `{ buckets: [{ bucket_name, visibility }] }`
- `listObjects({ bucket_name })` -> `{ objects: [{ object_key, size, last_modified, etag }] }`
- `getObjectInfo({ bucket_name, object_key })` -> `{ object_key, size, last_modified, etag }`
- `renameObject({ bucket_name, source_key, target_key, overwrite_key })` -> `{ success }`
- `getUploadUrl({ bucket_name, object_key })` -> `{ upload_url, expires_at }`
- `getDownloadUrl({ bucket_name, object_key })` -> `{ download_url, expires_at }`
- `upload({ bucket_name, object_key?, file?, accept? })` auto `getUploadUrl` + upload; `download({ bucket_name, object_key })` auto `getDownloadUrl` + trigger browser download (returns downloadUrl)

