# pi-ads

A [pi](https://github.com/MarioZechner/pi-coding-agent) extension for querying [NASA's Astrophysics Data System (ADS)](https://ui.adsabs.harvard.edu).

Provides three tools for searching papers, fetching paper details, and exploring citation graphs — all directly from your pi coding agent.

## Setup

### 1. Get an ADS API token

1. Create a free account at [ui.adsabs.harvard.edu](https://ui.adsabs.harvard.edu) and log in.
2. Go to **Settings → Token** and click **"Generate a new key"**.

### 2. Set the environment variable

```bash
export ADS_API_TOKEN="your-token-here"
```

Add this to your `~/.bashrc`, `~/.zshrc`, or equivalent so it persists across sessions.

### 3. Install the package

```bash
pi install npm:@guanyilun/pi-ads
```

Or install from the GitHub repository:

```bash
pi install git:github.com/guanyilun/pi-ads
```

For a quick one-shot test without installing:

```bash
pi -e /path/to/pi-ads
```

## Tools

### `ads_search` — Search ADS papers

Search the full ADS database with fielded queries, filters, and sorting.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `query` | string | **Required.** Search query. Supports fielded syntax: `title:exoplanets`, `author:"Spergel, D"`, `keyword:"dark matter"`, `year:2023`, `bibcode:2023ApJ...950L..12A`, `doi:10.3847/...`. Unfielded terms search all metadata. Use quotes for phrases, `+`/`-` for inclusion/exclusion. |
| `database` | string | Filter by database: `astronomy`, `physics`, or `general`. |
| `doctype` | string | Filter by document type: `article`, `proceedings`, `thesis`, `book`, `catalog`, `software`, `proposal`. |
| `refereed` | boolean | Filter to only peer-reviewed papers. |
| `year_from` | string | Start year for date range, e.g. `"2020"`. |
| `year_to` | string | End year for date range, e.g. `"2024"`. |
| `max_results` | number | Max papers to return (default 10, max 50). |
| `sort_by` | string | Sort order: `relevance` (default), `date`, `citation_count`, `read_count`. |
| `start` | number | Pagination offset (default 0). |

**Example prompts:**
- *"Search ADS for recent papers about fast radio bursts"*
- *"Find highly-cited papers about dark energy by Spergel, sorted by citation count"*
- *"Search for refereed articles about exoplanets in the astronomy database from 2023"*
- *"Find papers with 'transiting exoplanets' in the title, excluding Kepler"*

### `ads_paper` — Fetch a specific paper

Look up a paper by its ADS bibcode, DOI, or arXiv ID.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `id` | string | **Required.** ADS bibcode (`2023ApJ...950L..12A`), DOI (`10.3847/2041-8213/acb7e0`), or arXiv ID (`arXiv:2301.01234`). |
| `bibtex` | boolean | Include BibTeX citation in the result (default false). |

**Example prompts:**
- *"Look up bibcode 2023ApJ...950L..12A on ADS and give me the BibTeX"*
- *"Find the ADS entry for DOI 10.3847/2041-8213/acb7e0"*
- *"Fetch arxiv paper 2301.01234 from ADS"*

### `ads_citations` — Explore citation graphs

Find papers that cite a given paper (forward citations) or that a given paper cites (backward references).

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `bibcode` | string | **Required.** ADS bibcode of the paper. |
| `direction` | string | `citations` (papers citing this one — default) or `references` (papers this one cites). |
| `max_results` | number | Max papers to return (default 20, max 50). |
| `sort_by` | string | Sort order: `date` (default), `citation_count`, or `read_count`. |
| `start` | number | Pagination offset (default 0). |

**Example prompts:**
- *"Find papers citing 2023ApJ...950L..12A"*
- *"Show me the references of 2019ARA&A..57..417P sorted by citation count"*
- *"What are the most-cited papers that cite bibcode 2020MNRAS.498.1424W?"*

## Advanced Query Syntax

The `query` parameter in `ads_search` supports the full [ADS/Solr search syntax](https://ui.adsabs.harvard.edu/help/search/):

- **Fielded search:** `title:exoplanets`, `author:"Hubble, E"`, `abstract:"dark energy"`, `keyword:"gravitational waves"`
- **Phrase search:** `"black holes"` (use quotes for exact phrases)
- **Boolean operators:** `"transiting exoplanets" +JWST -Kepler`
- **Date ranges:** `year:2023`, `year:[2020 TO 2024]`, `pubdate:[2023-01-00 TO *]`
- **Wildcard:** `title:exoplanet*`

## Rate Limits

The ADS API allows **5,000 queries per day** per token. Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in API responses.

## License

MIT
