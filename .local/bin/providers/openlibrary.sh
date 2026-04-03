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
    jq -n \
        --arg id "openlibrary:$key" \
        --arg title "$title" \
        --arg type "book" \
        --arg status "planned" \
        --arg unit "page" \
        --arg author "$author" \
        --arg series "$series" \
        --arg description "$description" \
        --argjson year "$year" \
        --argjson subjects "$subjects" \
        --argjson isbn "$isbn" \
        '{
            id: $id,
            title: $title,
            type: $type,
            subtype: null,
            status: $status,
            progress: { current: 0, total: null, unit: $unit },
            seasons: { current: 0, total: null },
            metadata: {
                year: $year,
                release_date: (.first_publish_date // $year | tostring // null),
                genres: $subjects,
                author: [$author],
                series: $series,
                isbn: $isbn
            },
            source: { provider: "openlibrary", id: $id },
            local: { path: "", available: false },
            timestamps: {
                added: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
                updated: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))
            },
            overview: $description
        }'
}
