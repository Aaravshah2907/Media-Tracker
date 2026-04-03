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
    read -r -d '' graphql_query <<EOF
{
  "query": "query (\$search: String) { Media(search: \$search, type: $anilist_type) { id title { romaji english native } format status episodes chapters volumes startDate { year month day } genres description } }",
  "variables": { "search": "$query" }
}
EOF

    # Fetch and map JSON in a single step for robustness
    curl -s -X POST -H "Content-Type: application/json" -d "$graphql_query" https://graphql.anilist.co | jq -c --arg type "$type" --arg subtype "$subtype" '
        .data.Media | . as $media |
        {
          id: "anilist:\(.id)",
          title: (.title.english // .title.romaji // .title.native // "Unknown"),
          type: $type,
          subtype: $subtype,
          status: (.status | ascii_downcase // "planned"),
          progress: {
            current: 0,
            total: (if $type == "anime" then .episodes else .chapters end // 1),
            unit: (if $type == "anime" then "episode" else "chapter" end)
          },
          seasons: {
            current: 0,
            total: (if $type == "anime" then null else .volumes end)
          },
          metadata: {
            year: .startDate.year,
            release_date: (if .startDate.year then
              "\(.startDate.year)-\(if .startDate.month then (.startDate.month | tostring | lpad(2; "0")) else "01" end)-\(if .startDate.day then (.startDate.day | tostring | lpad(2; "0")) else "01" end)"
            else null end),
            genres: (.genres // [])
          },
          source: {
            provider: "anilist",
            id: (.id | tostring)
          },
          local: {path: "", available: false},
          timestamps: {added: (now | strftime("%Y-%m-%dT%H:%M:%SZ")), updated: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))},
          overview: (.description | gsub("<[^>]*>"; "") // "")
        }
    '
}
