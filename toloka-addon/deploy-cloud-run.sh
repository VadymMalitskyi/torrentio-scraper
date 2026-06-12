#!/bin/sh
set -eu

: "${GCP_PROJECT:?Set GCP_PROJECT}"
: "${GCP_REGION:=europe-west1}"
: "${GCP_REPOSITORY:=torrentio}"
: "${CLOUD_RUN_SERVICE:=toloka-addon}"
: "${RUNTIME_SERVICE_ACCOUNT:=toloka-addon-runtime@${GCP_PROJECT}.iam.gserviceaccount.com}"

IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${GCP_REPOSITORY}/${CLOUD_RUN_SERVICE}:$(git rev-parse --short HEAD)"

gcloud builds submit \
  --project "${GCP_PROJECT}" \
  --tag "${IMAGE}" \
  .

gcloud run deploy "${CLOUD_RUN_SERVICE}" \
  --project "${GCP_PROJECT}" \
  --region "${GCP_REGION}" \
  --image "${IMAGE}" \
  --service-account "${RUNTIME_SERVICE_ACCOUNT}" \
  --allow-unauthenticated \
  --cpu 1 \
  --memory 256Mi \
  --min 0 \
  --max 1 \
  --concurrency 4 \
  --timeout 60 \
  --set-secrets "TOLOKA_USERNAME=toloka-username:latest,TOLOKA_PASSWORD=toloka-password:latest,TORBOX_API_TOKEN=torbox-api-token:latest,ADDON_SECRET=addon-secret:latest,SIGNING_SECRET=signing-secret:latest"
