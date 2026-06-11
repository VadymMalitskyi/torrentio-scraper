#!/bin/sh
set -eu

: "${GCP_PROJECT:?Set GCP_PROJECT}"
: "${GCP_REGION:=europe-west1}"
: "${GCP_REPOSITORY:=torrentio}"
: "${RUNTIME_SERVICE_ACCOUNT_NAME:=toloka-addon-runtime}"

RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT_NAME}@${GCP_PROJECT}.iam.gserviceaccount.com"

wait_for_service_account() {
  attempt=0
  while [ "${attempt}" -lt 10 ]; do
    if gcloud iam service-accounts describe "${RUNTIME_SERVICE_ACCOUNT}" \
      --project "${GCP_PROJECT}" >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 3
  done
  printf '%s\n' "Service account ${RUNTIME_SERVICE_ACCOUNT} is not visible yet." >&2
  return 1
}

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  --project "${GCP_PROJECT}"

if ! gcloud artifacts repositories describe "${GCP_REPOSITORY}" \
  --project "${GCP_PROJECT}" \
  --location "${GCP_REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${GCP_REPOSITORY}" \
    --project "${GCP_PROJECT}" \
    --location "${GCP_REGION}" \
    --repository-format docker
fi

if ! gcloud iam service-accounts describe "${RUNTIME_SERVICE_ACCOUNT}" \
  --project "${GCP_PROJECT}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${RUNTIME_SERVICE_ACCOUNT_NAME}" \
    --project "${GCP_PROJECT}" \
    --display-name "Toloka addon runtime"
fi

wait_for_service_account

for secret in toloka-username toloka-password torbox-api-token addon-secret signing-secret; do
  if ! gcloud secrets describe "${secret}" --project "${GCP_PROJECT}" >/dev/null 2>&1; then
    gcloud secrets create "${secret}" \
      --project "${GCP_PROJECT}" \
      --replication-policy automatic
  fi
  gcloud secrets add-iam-policy-binding "${secret}" \
    --project "${GCP_PROJECT}" \
    --member "serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
    --role roles/secretmanager.secretAccessor >/dev/null
done

printf '%s\n' "GCP resources are ready."
printf '%s\n' "Add one version to each secret, then run ./deploy-cloud-run.sh."
