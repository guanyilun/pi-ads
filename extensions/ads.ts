import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

const ADS_SEARCH_API = "https://api.adsabs.harvard.edu/v1/search/query";
const ADS_EXPORT_API = "https://api.adsabs.harvard.edu/v1/export";
const ADS_LINK_GATEWAY = "https://ui.adsabs.harvard.edu/link_gateway";

const SEARCH_FIELDS = [
    "bibcode", "title", "author", "abstract", "pubdate", "year",
    "citation_count", "read_count", "doi", "identifier", "pub",
    "arxiv_class", "keyword", "database", "doctype", "aff",
    "volume", "issue", "page", "bibstem",
].join(",");

interface ADSPaper {
    bibcode: string;
    title: string;
    authors: string[];
    affiliations: string[];
    abstract: string;
    pubdate: string;
    year: string;
    citationCount: number;
    readCount: number;
    doi: string[];
    identifier: string[];
    pub: string;
    bibstem: string;
    volume: string;
    issue: string;
    page: string;
    arxivClass: string[];
    keywords: string[];
    database: string[];
    doctype: string;
}

interface SearchDetails {
    query: string;
    totalResults: number;
    returned: number;
    papers: ADSPaper[];
}

interface PaperDetails {
    paper: ADSPaper | null;
    bibtex?: string;
}

interface CitationsDetails {
    bibcode: string;
    direction: "citations" | "references";
    totalResults: number;
    returned: number;
    papers: ADSPaper[];
}

function parseDoc(doc: any): ADSPaper {
    return {
        bibcode: doc.bibcode ?? "",
        title: Array.isArray(doc.title) ? doc.title.join(" ") : (doc.title ?? ""),
        authors: Array.isArray(doc.author) ? doc.author : doc.author ? [doc.author] : [],
        affiliations: Array.isArray(doc.aff) ? doc.aff : doc.aff ? [doc.aff] : [],
        abstract: doc.abstract ?? "",
        pubdate: doc.pubdate ?? "",
        year: doc.year ?? "",
        citationCount: doc.citation_count ?? 0,
        readCount: doc.read_count ?? 0,
        doi: Array.isArray(doc.doi) ? doc.doi : doc.doi ? [doc.doi] : [],
        identifier: Array.isArray(doc.identifier) ? doc.identifier : doc.identifier ? [doc.identifier] : [],
        pub: doc.pub ?? "",
        bibstem: Array.isArray(doc.bibstem) ? doc.bibstem[0] ?? "" : (doc.bibstem ?? ""),
        volume: doc.volume ?? "",
        issue: doc.issue ?? "",
        page: doc.page ?? "",
        arxivClass: Array.isArray(doc.arxiv_class) ? doc.arxiv_class : doc.arxiv_class ? [doc.arxiv_class] : [],
        keywords: Array.isArray(doc.keyword) ? doc.keyword : doc.keyword ? [doc.keyword] : [],
        database: Array.isArray(doc.database) ? doc.database : doc.database ? [doc.database] : [],
        doctype: doc.doctype ?? "",
    };
}

function formatPaper(p: ADSPaper, index?: number): string {
    const prefix = index !== undefined ? `[${index + 1}] ` : "";
    const lines: string[] = [
        `${prefix}${p.title}`,
        `    Bibcode: ${p.bibcode}`,
        `    Authors: ${p.authors.join("; ")}`,
        `    Published: ${p.pubdate}  Year: ${p.year}`,
        `    Journal: ${p.pub}`,
    ];
    if (p.doi.length > 0) lines.push(`    DOI: ${p.doi.join(", ")}`);
    if (p.arxivClass.length > 0) lines.push(`    arXiv: ${p.arxivClass.join(", ")}`);
    if (p.keywords.length > 0) lines.push(`    Keywords: ${p.keywords.slice(0, 10).join(", ")}`);
    lines.push(`    Citations: ${p.citationCount}  Reads: ${p.readCount}`);
    lines.push(`    ADS URL: ${ADS_LINK_GATEWAY}/${p.bibcode}`);
    if (p.abstract) lines.push(`    Abstract: ${p.abstract}`);
    return lines.join("\n");
}

function formatPaperCompact(p: ADSPaper, index?: number): string {
    const prefix = index !== undefined ? `[${index + 1}] ` : "";
    const authorStr = p.authors.length > 0
        ? p.authors.length === 1
            ? p.authors[0]
            : `${p.authors[0]} et al.`
        : "Unknown";
    return `${prefix}${p.title}\n    ${p.bibcode} | ${authorStr} | ${p.year} | ${p.bibstem || p.pub} | ${p.citationCount} cit`;
}

function getToken(): string {
    const token = process.env.ADS_API_TOKEN ?? "";
    if (!token) {
        throw new Error(
            "ADS_API_TOKEN environment variable not set. " +
            "Get a token from https://ui.adsabs.harvard.edu/#user/settings/token and set it in your environment."
        );
    }
    return token;
}

async function adsFetch(url: string, signal?: AbortSignal, options?: RequestInit): Promise<any> {
    const token = getToken();
    const resp = await fetch(url, {
        ...options,
        signal,
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(options?.headers ?? {}),
        },
    });
    if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`ADS API error: ${resp.status} ${resp.statusText}${body ? ` - ${body}` : ""}`);
    }
    return resp.json();
}

function buildSortParam(sortBy: string): string {
    const map: Record<string, string> = {
        relevance: "score desc",
        date: "date desc",
        citation_count: "citation_count desc",
        read_count: "read_count desc",
    };
    return map[sortBy] ?? "score desc";
}

export default function (pi: ExtensionAPI) {
    pi.registerTool({
        name: "ads_search",
        label: "ADS Search",
        description:
            "Search NASA's Astrophysics Data System (ADS) for astronomy and physics papers. " +
            "Supports fielded queries (title:, author:, abstract:, keyword:, year:, bibcode:, doi:, etc.), " +
            "database filters (astronomy, physics, general), and sorting by relevance, date, or citation count. " +
            "Use detail='compact' (default) for concise summaries, or detail='full' to include abstracts, all authors, and keywords. " +
            "Requires ADS_API_TOKEN environment variable.",
        promptSnippet:
            "Search NASA ADS for astronomy/physics papers. Supports fielded queries, database filters, and sorting. " +
            "Returns compact summaries by default. Use detail='full' for abstracts.",
        parameters: Type.Object({
            query: Type.String({
                description:
                    'Search query. Supports fielded searches like "title:exoplanets", ' +
                    '"author:\\"Hubble, E\\"", "keyword:dark matter", "year:2023", ' +
                    '"bibcode:2023ApJ...950L..12A", "doi:10.3847/2041-8213/acbe no". ' +
                    'Unfielded terms search all metadata, e.g. "black holes". ' +
                    'Use quotes for phrases, +/- for inclusion/exclusion.',
            }),
            database: Type.Optional(
                StringEnum(["astronomy", "physics", "general"] as const, {
                    description: "Filter by ADS database (astronomy, physics, or general). Default: searches all databases.",
                })
            ),
            doctype: Type.Optional(
                StringEnum(["article", "proceedings", "thesis", "book", "catalog", "software", "proposal"] as const, {
                    description: "Filter by document type (e.g. article, proceedings, thesis).",
                })
            ),
            refereed: Type.Optional(
                Type.Boolean({ description: "Filter to only refereed (peer-reviewed) papers." })
            ),
            year_from: Type.Optional(
                Type.String({ description: "Start year for date range filter, e.g. '2020'." })
            ),
            year_to: Type.Optional(
                Type.String({ description: "End year for date range filter, e.g. '2024'." })
            ),
            max_results: Type.Optional(
                Type.Number({ description: "Max papers to return (default 10, max 50)", default: 10 })
            ),
            sort_by: Type.Optional(
                StringEnum(["relevance", "date", "citation_count", "read_count"] as const, {
                    description: "Sort order (default: relevance).",
                })
            ),
            start: Type.Optional(
                Type.Number({ description: "Start index for pagination (default 0)", default: 0 })
            ),
            detail: Type.Optional(
                StringEnum(["compact", "full"] as const, {
                    description: "Output detail level. 'compact' (default): title, first author, year, bibcode, citations — minimal context. 'full': includes abstract, all authors, keywords, DOI.",
                })
            ),
        }),

        async execute(_toolCallId, params, signal) {
            const maxResults = Math.min(params.max_results ?? 10, 50);
            const start = params.start ?? 0;
            const sort = buildSortParam(params.sort_by ?? "relevance");

            // Build filter queries
            const fq: string[] = [];
            if (params.database) fq.push(`database:${params.database}`);
            if (params.doctype) fq.push(`doctype:${params.doctype}`);
            if (params.refereed) fq.push("property:refereed");
            if (params.year_from || params.year_to) {
                const from = params.year_from ?? "*";
                const to = params.year_to ?? "*";
                fq.push(`year:[${from} TO ${to}]`);
            }

            const fqParam = fq.map(f => `&fq=${encodeURIComponent(f)}`).join("");
            const url =
                `${ADS_SEARCH_API}?q=${encodeURIComponent(params.query)}` +
                `&fl=${SEARCH_FIELDS}&rows=${maxResults}&start=${start}` +
                `&sort=${encodeURIComponent(sort)}${fqParam}`;

            const data = await adsFetch(url, signal);
            const response = data.response ?? data;
            const docs: any[] = response.docs ?? [];
            const totalResults = response.numFound ?? 0;

            if (docs.length === 0) {
                return {
                    content: [{ type: "text", text: `No papers found for query: ${params.query}` }],
                    details: { query: params.query, totalResults: 0, returned: 0, papers: [] } as SearchDetails,
                };
            }

            const papers = docs.map(parseDoc);
            const detail = params.detail ?? "compact";
            const formatter = detail === "full" ? formatPaper : formatPaperCompact;
            const header = `Found ${totalResults} papers (showing ${start + 1}-${start + papers.length}):\n`;
            const body = papers.map((p, i) => formatter(p, i)).join("\n\n");
            let text = header + body;

            // Pagination hint
            const nextStart = start + papers.length;
            if (nextStart < totalResults) {
                text += `\n\n→ Use start=${nextStart} to see the next page of results.`;
            }

            const truncation = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
            text = truncation.content;
            if (truncation.truncated) {
                text += `\n\n[Output truncated: ${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}]`;
            }

            return {
                content: [{ type: "text", text }],
                details: { query: params.query, totalResults, returned: papers.length, papers } as SearchDetails,
            };
        },

        renderCall(args, theme) {
            let text = theme.fg("toolTitle", theme.bold("ads "));
            text += theme.fg("accent", `"${args.query}"`);
            if (args.database) text += theme.fg("muted", ` db:${args.database}`);
            if (args.refereed) text += theme.fg("muted", " refereed");
            if (args.max_results) text += theme.fg("dim", ` max:${args.max_results}`);
            return new Text(text, 0, 0);
        },

        renderResult(result, { expanded }, theme) {
            const details = result.details as SearchDetails | undefined;
            if (!details || details.returned === 0) {
                return new Text(theme.fg("dim", "No papers found"), 0, 0);
            }

            let text = theme.fg("success", `${details.totalResults} results`);
            text += theme.fg("dim", ` (showing ${details.returned})`);

            if (expanded) {
                for (const p of details.papers) {
                    text += "\n\n" + theme.fg("accent", theme.bold(p.title));
                    text += "\n" + theme.fg("dim", `${p.bibcode} · ${p.pubdate} · ${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""}`);
                    text += " " + theme.fg("muted", `(${p.citationCount} cit)`);
                }
            }

            return new Text(text, 0, 0);
        },
    });

    pi.registerTool({
        name: "ads_paper",
        label: "ADS Paper",
        description:
            "Fetch details of a specific paper from NASA's ADS by bibcode, DOI, or arXiv ID. " +
            "Accepts ADS bibcodes like '2023ApJ...950L..12A', DOIs like '10.3847/2041-8213/acb7e0', " +
            "or arXiv IDs like 'arXiv:2301.01234'. Optionally returns BibTeX for citation. " +
            "Requires ADS_API_TOKEN environment variable.",
        promptSnippet:
            "Fetch a specific ADS paper by bibcode, DOI, or arXiv ID. Optionally returns BibTeX.",
        parameters: Type.Object({
            id: Type.String({
                description:
                    'Paper identifier: ADS bibcode (e.g. "2023ApJ...950L..12A"), ' +
                    'DOI (e.g. "10.3847/2041-8213/acb7e0"), or arXiv ID (e.g. "arXiv:2301.01234").',
            }),
            bibtex: Type.Optional(
                Type.Boolean({ description: "Include BibTeX citation (default: false)." })
            ),
        }),

        async execute(_toolCallId, params, signal) {
            let query: string;
            const id = params.id.trim();

            // Detect identifier type and build appropriate query
            if (id.startsWith("10.") || id.startsWith("doi:")) {
                const doi = id.replace(/^doi:/, "");
                query = `doi:"${doi}"`;
            } else if (id.toLowerCase().startsWith("arxiv:") || /^\d{4}\.\d{4,5}/.test(id)) {
                const arxivId = id.replace(/^arxiv:/i, "");
                query = `arxiv:"${arxivId}"`;
            } else {
                // Assume bibcode
                query = `bibcode:${id}`;
            }

            const url =
                `${ADS_SEARCH_API}?q=${encodeURIComponent(query)}` +
                `&fl=${SEARCH_FIELDS}&rows=1`;

            const data = await adsFetch(url, signal);
            const response = data.response ?? data;
            const docs: any[] = response.docs ?? [];

            if (docs.length === 0) {
                return {
                    content: [{ type: "text", text: `Paper not found: ${id}` }],
                    details: { paper: null } as PaperDetails,
                    isError: true,
                };
            }

            const paper = parseDoc(docs[0]);
            let text = formatPaper(paper);

            // Optionally fetch BibTeX
            let bibtex: string | undefined;
            if (params.bibtex && paper.bibcode) {
                try {
                    const exportUrl = `${ADS_EXPORT_API}/bibtex`;
                    const exportData = await adsFetch(exportUrl, signal, {
                        method: "POST",
                        body: JSON.stringify({ bibcode: [paper.bibcode] }),
                    });
                    bibtex = exportData.export ?? "";
                    if (bibtex) {
                        text += `\n\nBibTeX:\n${bibtex}`;
                    }
                } catch {
                    text += "\n\n[Failed to fetch BibTeX]";
                }
            }

            return {
                content: [{ type: "text", text }],
                details: { paper, bibtex } as PaperDetails,
            };
        },

        renderCall(args, theme) {
            let text = theme.fg("toolTitle", theme.bold("ads "));
            text += theme.fg("accent", args.id);
            if (args.bibtex) text += theme.fg("dim", " +bibtex");
            return new Text(text, 0, 0);
        },

        renderResult(result, { expanded }, theme) {
            const details = result.details as PaperDetails | undefined;
            if (!details?.paper) {
                return new Text(theme.fg("error", "Paper not found"), 0, 0);
            }

            const p = details.paper;
            let text = theme.fg("accent", theme.bold(p.title));
            text += "\n" + theme.fg("dim", `${p.bibcode} · ${p.pubdate}`);
            text += "\n" + theme.fg("muted", p.authors.join("; "));
            text += "\n" + theme.fg("muted", `${p.pub}`);
            text += " " + theme.fg("success", `${p.citationCount} cit`);

            if (expanded) {
                if (p.keywords.length > 0) {
                    text += "\n" + theme.fg("dim", `Keywords: ${p.keywords.join(", ")}`);
                }
                if (p.doi.length > 0) {
                    text += "\n" + theme.fg("dim", `DOI: ${p.doi.join(", ")}`);
                }
                if (p.abstract) {
                    text += "\n\n" + p.abstract;
                }
                if (details.bibtex) {
                    text += "\n\n" + theme.fg("dim", "BibTeX available");
                }
            }

            return new Text(text, 0, 0);
        },
    });

    pi.registerTool({
        name: "ads_citations",
        label: "ADS Citations",
        description:
            "Find papers that cite a given paper (citations) or that a given paper cites (references). " +
            "Uses ADS bibcode identifiers. " +
            "Use detail='compact' (default) for concise summaries, or detail='full' to include abstracts, all authors, and keywords. " +
            "Requires ADS_API_TOKEN environment variable.",
        promptSnippet:
            "Find citing or referenced papers for an ADS bibcode. Returns compact summaries by default. Use detail='full' for abstracts.",
        parameters: Type.Object({
            bibcode: Type.String({
                description: 'ADS bibcode of the paper, e.g. "2023ApJ...950L..12A".',
            }),
            direction: Type.Optional(
                StringEnum(["citations", "references"] as const, {
                    description: '"citations" = papers that cite this paper (default). "references" = papers this paper cites.',
                })
            ),
            max_results: Type.Optional(
                Type.Number({ description: "Max papers to return (default 10, max 50)", default: 10 })
            ),
            sort_by: Type.Optional(
                StringEnum(["date", "citation_count", "read_count"] as const, {
                    description: "Sort order (default: date).",
                })
            ),
            start: Type.Optional(
                Type.Number({ description: "Start index for pagination (default 0)", default: 0 })
            ),
            detail: Type.Optional(
                StringEnum(["compact", "full"] as const, {
                    description: "Output detail level. 'compact' (default): title, first author, year, bibcode, citations — minimal context. 'full': includes abstract, all authors, keywords, DOI.",
                })
            ),
        }),

        async execute(_toolCallId, params, signal) {
            const direction = params.direction ?? "citations";
            const maxResults = Math.min(params.max_results ?? 10, 50);
            const start = params.start ?? 0;
            const sortField = params.sort_by ?? "date";
            const sort = buildSortParam(sortField);

            // ADS uses citations(bibcode) and references(bibcode) query syntax
            const queryFunc = direction === "citations" ? "citations" : "references";
            const query = `${queryFunc}(${params.bibcode})`;

            const url =
                `${ADS_SEARCH_API}?q=${encodeURIComponent(query)}` +
                `&fl=${SEARCH_FIELDS}&rows=${maxResults}&start=${start}` +
                `&sort=${encodeURIComponent(sort)}`;

            const data = await adsFetch(url, signal);
            const response = data.response ?? data;
            const docs: any[] = response.docs ?? [];
            const totalResults = response.numFound ?? 0;

            if (docs.length === 0) {
                const label = direction === "citations" ? "citing" : "referenced by";
                return {
                    content: [{ type: "text", text: `No papers ${label} ${params.bibcode}` }],
                    details: { bibcode: params.bibcode, direction, totalResults: 0, returned: 0, papers: [] } as CitationsDetails,
                };
            }

            const papers = docs.map(parseDoc);
            const detail = params.detail ?? "compact";
            const formatter = detail === "full" ? formatPaper : formatPaperCompact;
            const dirLabel = direction === "citations" ? "citing papers" : "referenced papers";
            const header = `Found ${totalResults} ${dirLabel} (showing ${start + 1}-${start + papers.length}):
`;
            const body = papers.map((p, i) => formatter(p, i)).join("\n\n");
            let text = header + body;

            // Pagination hint
            const nextStart = start + papers.length;
            if (nextStart < totalResults) {
                text += `\n\n→ Use start=${nextStart} to see the next page of results.`;
            }

            const truncation = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
            text = truncation.content;
            if (truncation.truncated) {
                text += `\n\n[Output truncated: ${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}]`;
            }

            return {
                content: [{ type: "text", text }],
                details: { bibcode: params.bibcode, direction, totalResults, returned: papers.length, papers } as CitationsDetails,
            };
        },

        renderCall(args, theme) {
            const dir = args.direction ?? "citations";
            let text = theme.fg("toolTitle", theme.bold("ads "));
            text += theme.fg("accent", args.bibcode);
            text += theme.fg("muted", ` ${dir}`);
            return new Text(text, 0, 0);
        },

        renderResult(result, { expanded }, theme) {
            const details = result.details as CitationsDetails | undefined;
            if (!details || details.returned === 0) {
                return new Text(theme.fg("dim", "No citations found"), 0, 0);
            }

            const dirLabel = details.direction === "citations" ? "citing" : "referenced";
            let text = theme.fg("success", `${details.totalResults} ${dirLabel}`);
            text += theme.fg("dim", ` (showing ${details.returned})`);

            if (expanded) {
                for (const p of details.papers) {
                    text += "\n\n" + theme.fg("accent", theme.bold(p.title));
                    text += "\n" + theme.fg("dim", `${p.bibcode} · ${p.pubdate} · ${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""}`);
                    text += " " + theme.fg("muted", `(${p.citationCount} cit)`);
                }
            }

            return new Text(text, 0, 0);
        },
    });
}
