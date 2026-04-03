#!/usr/bin/env bash

tvmaze_add() {
  local query="$1"

  encoded=$(echo "$query" | sed 's/ /%20/g')

  single=$(curl -s "https://api.tvmaze.com/singlesearch/shows?q=$encoded" || true)
  search=$(curl -s "https://api.tvmaze.com/search/shows?q=$encoded")

  if echo "$single" | jq . >/dev/null 2>&1; then
    combined=$(jq -n \
      --argjson single "$single" \
      --argjson search "$search" '
        [{show: $single}] + $search
        | unique_by(.show.id)
      ')
  else
    combined="$search"
  fi

  selection=$(echo "$combined" | jq -r '
    .[] | "\(.show.name) (\(.show.premiered // "N/A")) | ID:\(.show.id)"
  ' | fzf --prompt="Select show: ")

  [ -z "$selection" ] && exit 1

  id=$(echo "$selection" | sed -E 's/.*ID:([0-9]+)/\1/')

  show=$(echo "$combined" | jq --arg id "$id" '
    .[] | select(.show.id == ($id | tonumber)) | .show
  ')

  title=$(echo "$show" | jq -r '.name')
  year=$(echo "$show" | jq -r '.premiered // empty' | cut -d- -f1)

  episodes_json=$(curl -s "https://api.tvmaze.com/shows/$id/episodes")

  total_episodes=$(echo "$episodes_json" | jq 'length')
  total_seasons=$(echo "$episodes_json" | jq '[.[].season] | max')

  jq -n \
    --arg id "tvmaze:$id" \
    --arg title "$title" \
    --arg year "$year" \
    --argjson episodes "$total_episodes" \
    --argjson seasons "$total_seasons" \
    '{
      id: $id,
      title: $title,

      type: "tv",
      subtype: null,

      status: "planned",

      progress: {
        current: 0,
        total: $episodes,
        unit: "episode"
      },

      seasons: {
        current: 0,
        total: $seasons
      },

      metadata: {
        year: ($year | tonumber?),
        genres: []
      },

      source: {
        provider: "tvmaze",
        id: ($id | split(":")[1])
      },

      local: {
        path: "",
        available: false
      },

      timestamps: {
        added: (now | todate),
        updated: (now | todate)
      }
    }'
}
