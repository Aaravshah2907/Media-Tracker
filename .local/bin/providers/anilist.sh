#!/usr/bin/env bash
# anilist_add "<query>" "<type>" "<subtype>"

# Escape a string safely for JSON
json_escape() {
    echo "$1" | jq -Rs '.'
}

anilist_add() {
    local query="$1"
    local type="$2"
    local subtype="${3:-}"

    local anilist_type
    case "$type" in
        anime) anilist_type="ANIME" ;;
        manga|novel) anilist_type="MANGA" ;;
        *) echo "{}"; return 1 ;;
    esac

    # GraphQL query
    graphql_query=$(jq -n --arg query "$query" --arg type "$anilist_type" '{
      query: "query ($search: String, $type: MediaType) { Media(search: $search, type: $type) { id title { romaji english native } format status episodes chapters volumes startDate { year month day } genres description source studios(isMain: true) { nodes { name } } coverImage { large medium } averageScore } }",
      variables: { search: $query, type: $type }
    }')

    # Fetch and map JSON in a single step for robustness
    curl -s -X POST -H "Content-Type: application/json" -d "$graphql_query" https://graphql.anilist.co | jq -c --arg type "$type" --arg subtype "$subtype" --arg now "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '
        .data.Media | . as $media |
        {
          id: "anilist:\(.id)",
          title: (.title.english // .title.romaji // .title.native // "Unknown"),
          type: $type,
          subtype: ($subtype // .format),
          status: (.status | ascii_downcase // "planned"),
          progress: {
            current: 0,
            total: (if $type == "anime" then .episodes else .chapters end // 0),
            unit: (if $type == "anime" then "episode" else (if $type == "manga" then "chapter" else "page" end))
          },
          seasons: {
            current: 0,
            total: (if $type == "anime" then 1 else (.volumes // 0) end)
          },
          metadata: {
            year: .startDate.year,
            release_date: (if .startDate.year then
              "\(.startDate.year)-\(if .startDate.month then (.startDate.month | tostring) else "01" end)-\(if .startDate.day then (.startDate.day | tostring) else "01" end)"
            else null end),
            genres: (.genres // [])
          },
          source: { provider: "anilist", id: (.id | tostring) },
          local: {path: "", available: false},
          details: {
            studios: [.studios.nodes[].name],
            source: .source,
            status: .status,
            format: .format
          },
          timestamps: {added: $now, updated: $now},
          overview: (.description | gsub("<[^>]*>"; "") // ""),
          poster_path: (.coverImage.large // .coverImage.medium // ""),
          rating: ((.averageScore // 0) / 10)
        }
    '
}
