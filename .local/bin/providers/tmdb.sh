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

    # Take the first results ID
    id=$(echo "$json" | jq -r '.results[0].id')
    
    # Fetch FULL details for this specific movie ID
    full_json=$(curl -s -H "Authorization: Bearer $TMDB_TOKEN" \
                 -H "accept: application/json" \
                 "https://api.themoviedb.org/3/movie/${id}?language=en-US")

    # Merge and map to our schema
    echo "$full_json" | jq --arg provider "tmdb" --arg now "$now" '
        {
            id: "\($provider):\(.id)",
            title: (.title // .name),
            type: "movie",
            subtype: null,
            status: "planned",
            progress: { current: 0, total: 1, unit: "movie" },
            seasons: null,
            metadata: { 
                year: (.release_date[0:4] // .first_air_date[0:4] // null), 
                release_date: (.release_date // .first_air_date // null),
                genres: (.genres | map(.name)) 
            },
            source: {
                provider: $provider,
                id: (.id|tostring)
            },
            local: { path: "", available: false },
            details: {
                runtime: .runtime,
                tagline: .tagline,
                budget: .budget,
                revenue: .revenue,
                collection: .belongs_to_collection?.name,
                production_companies: (.production_companies | map(.name))
            },
            timestamps: { added: $now, updated: $now },
            overview, poster_path, backdrop_path, vote_average, vote_count, tagline
        }
    '
}
