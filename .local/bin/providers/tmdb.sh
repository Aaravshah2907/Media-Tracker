#!/usr/bin/env bash

# Load environment variables
if [ -f "$HOME/.config/mt/.env" ]; then
    source "$HOME/.config/mt/.env"
else
    echo "Error: .env file not found!"
    exit 1
fi

tmdb_add() {
    local title="$1"
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Fetch JSON from TMDb API
    json=$(curl -s -H "Authorization: Bearer $TMDB_TOKEN" \
                 -H "accept: application/json" \
                 "https://api.themoviedb.org/3/search/movie?query=${title// /+}")

    # Validate JSON
    if ! echo "$json" | jq . >/dev/null 2>&1; then
        echo '{"error":"invalid JSON"}'
        return 1
    fi

    # Check if results exist
    if [ "$(echo "$json" | jq '.results | length')" -eq 0 ]; then
        echo '{}'  # Empty JSON to avoid jq errors
        return 1
    fi

    # Take the first result and map to library schema
    echo "$json" | jq --arg provider "tmdb" --arg now "$now" '
        .results[0] 
        | {
            id: "\($provider):\(.id)",
            title: .title,
            type: "movie",
            subtype: null,
            status: "planned",
            progress: { current: 0, total: 1, unit: "scene" },
            seasons: null,
            metadata: { 
                year: (.release_date[0:4] // null), 
                genres: .genre_ids 
            },
            source: {
                provider: $provider,
                id: (.id|tostring)
            },
            local: { path: "", available: false },
            timestamps: { added: $now, updated: $now },
            adult, backdrop_path, overview, poster_path, original_language, original_title, popularity, vote_average, vote_count
        }
    '
}
