#!/usr/bin/env bash
# openlibrary.sh - provider for books (Bash 3.x compatible)

set -euo pipefail

openlibrary_add() {
    local query="$1"

    # Fetch search results (limit 10)
    json=$(curl -s -A "mt-add/1.0" \
        "https://openlibrary.org/search.json?title=$(echo "$query" | jq -sRr @uri)&limit=10")

    # Validate JSON
    if ! echo "$json" | jq . >/dev/null 2>&1; then
        echo '{"error":"invalid JSON"}'
        return 1
    fi

    # Prepare fzf lines (1 line per doc, JSON encoded)
    tmpfile=$(mktemp)
    echo "$json" | jq -c '.docs[] | {
        key,
        title,
        author: (.author_name[0] // ""),
        series: (.series[0] // ""),
        year: (.first_publish_year // null)
    }' > "$tmpfile"

    if [ ! -s "$tmpfile" ]; then
        rm -f "$tmpfile"
        echo '{}'
        return 1
    fi

    # Pick one edition
    selection=$(cat "$tmpfile" | fzf --reverse --prompt="Select edition: ")
    rm -f "$tmpfile"

    if [ -z "$selection" ]; then
        echo '{}'
        return 1
    fi

    # Parse selection safely
    key=$(echo "$selection" | jq -r '.key // empty')
    title=$(echo "$selection" | jq -r '.title // empty')
    author=$(echo "$selection" | jq -r '.author // empty')
    series=$(echo "$selection" | jq -r '.series // empty')
    year=$(echo "$selection" | jq -r '.year // null')

    # Fetch full edition info
    doc=$(curl -s -A "mt-add/1.0" "https://openlibrary.org${key}.json")
    subjects=$(echo "$doc" | jq -c '.subjects // []')
    isbn=$(echo "$doc" | jq -c '.isbn // []')
    description=$(echo "$doc" | jq -r '.description // ""')
    # handle description as object
    if echo "$description" | grep -q '^{' 2>/dev/null; then
        description=$(echo "$description" | jq -r '.value // ""')
    fi

    # Output uniform JSON
    # Output uniform JSON
    echo "$doc" | jq --arg id "ol:$key" --arg now "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" --arg author "$author" --arg series "$series" --arg year "$year" '
        {
            id: $id,
            title: .title,
            type: "book",
            subtype: null,
            status: (.status // "planned"),
            progress: { current: 0, total: (.number_of_pages // 0), unit: "page" },
            seasons: null,
            metadata: {
                year: ($year | tonumber?),
                release_date: (.publish_date // $year | tostring // null),
                genres: (.subjects // []),
                author: [$author],
                series: $series,
                isbn: (.isbn_13 // .isbn_10 // [])
            },
            source: { provider: "openlibrary", id: $id },
            local: { path: "", available: false },
            details: {
                authors: [$author],
                publisher: (.publishers[0] // "Unknown"),
                published_date: (.publish_date // null),
                page_count: .number_of_pages,
                isbn: (.isbn_13 // .isbn_10 // []),
                series: $series
            },
            timestamps: { added: $now, updated: $now },
            overview: (if .description | type == "object" then .description.value else (.description // "") end),
            poster_path: (if .covers then "https://covers.openlibrary.org/b/id/\(.covers[0])-L.jpg" else "" end),
            rating: 0
        }
    '
}
