#!usr/bin/env bash
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
  "query": "query (\$search: String) { Media(search: \$search, type: $anilist_type) { id title { romaji english native } format status episodes chapters volumes startDate { year } genres description } }",
  "variables": { "search": "$query" }
}
EOF

    # Fetch JSON from Anilist API
    local json media
    json=$(curl -s -X POST -H "Content-Type: application/json" -d "$graphql_query" https://graphql.anilist.co)
    media=$(echo "$json" | jq -r '.data.Media // empty')

    if [ -z "$media" ] || [ "$media" = "null" ]; then
        echo '{}'
        return 1
    fi

    # Extract fields
    local id title status format episodes chapters volumes year month day genres description release_date
    id=$(echo "$media" | jq -r '.id')
    title=$(echo "$media" | jq -r '.title.english // .title.romaji // .title.native // empty' | jq -R .)
    status=$(echo "$media" | jq -r '.status // "planned"' | jq -R .)
    format=$(echo "$media" | jq -r '.format // empty' | jq -R .)
    episodes=$(echo "$media" | jq -r '.episodes // 1')
    chapters=$(echo "$media" | jq -r '.chapters // 1')
    volumes=$(echo "$media" | jq -r '.volumes // 1')
    
    year=$(echo "$media" | jq -r '.startDate.year // empty')
    month=$(echo "$media" | jq -r '.startDate.month // empty')
    day=$(echo "$media" | jq -r '.startDate.day // empty')
    
    # Format release_date YYYY-MM-DD
    if [ -n "$year" ]; then
        release_date="$year"
        [ -n "$month" ] && release_date="${release_date}-$(printf "%02d" "$month")"
        [ -n "$day" ] && release_date="${release_date}-$(printf "%02d" "$day")"
    fi

    genres=$(echo "$media" | jq -c '.genres // []')
    description=$(echo "$media" | jq -r '.description // ""' | jq -R .)

    # Determine progress & unit
    local progress_total seasons_total unit
    if [ "$type" = "anime" ]; then
        progress_total=$episodes
        seasons_total=null
        unit="episode"
    else
        progress_total=$chapters
        seasons_total=$volumes
        unit="chapter"
    fi
    
    jq -n \
        --arg id "anilist:$id" \
        --arg title "$title" \
        --arg type "$type" \
        --arg subtype "$subtype" \
        --arg status "$status" \
        --arg unit "$unit" \
        --arg release_date "$release_date" \
        --argjson total "$progress_total" \
        --argjson seasons_total "$seasons_total" \
        --argjson year "${year:-null}" \
        --argjson genres "$genres" \
        --arg description "$description" \
        '{
          id: $id,
          title: $title,
          type: $type,
          subtype: $subtype,
          status: $status,
          progress: {current: 0, total: $total, unit: $unit},
          seasons: {current: 0, total: $seasons_total},
          metadata: {year: $year, release_date: $release_date, genres: $genres},
          source: {provider: "anilist", id: ($id | split(":")[1])},
          local: {path: "", available: false},
          timestamps: {added: now | todateiso8601, updated: now | todateiso8601},
          overview: $description
        }'
}
