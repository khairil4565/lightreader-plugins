// @id novelfull
// @name NovelFull
// @version 1.3.2
// @description Read novels from NovelFull.net - SMART overlap detection: skip duplicates, get exactly 50 new chapters per page
// @author khairil4565
// @website https://novelfull.net

class NovelFullPlugin extends BasePlugin {
    constructor(config) {
        super(config);
        this.baseURL = 'https://novelfull.net';
        this.maxConcurrentRequests = 10;
    }

    async searchNovels(query) {
        console.log('Searching for: ' + query);
        
        try {
            let url;
            
            switch(query.toLowerCase()) {
                case 'popular':
                    url = this.baseURL + '/most-popular';
                    break;
                case 'latest':
                    url = this.baseURL + '/latest-release-novel';
                    break;
                case 'hot':
                    url = this.baseURL + '/hot-novel';
                    break;
                case 'completed':
                    url = this.baseURL + '/completed-novel';
                    break;
                default:
                    url = this.baseURL + '/search?keyword=' + encodeURIComponent(query);
            }
            
            console.log('Fetching from URL: ' + url);
            const html = await fetch(url);
            
            return this.parseNovelList(html, query);
            
        } catch (error) {
            console.log('Error searching novels: ' + error);
            return [];
        }
    }

    async parseNovelList(html, queryType) {
        try {
            const selector = '.list.list-truyen .row';
            
            console.log('Using selector: ' + selector);
            const novelElements = parseHTML(html, selector);
            console.log('Found ' + novelElements.length + ' novel elements');
            
            const novels = [];
            const elementsToProcess = Math.min(novelElements.length, 10);
            
            for (let i = 0; i < elementsToProcess; i++) {
                try {
                    const element = novelElements[i];
                    
                    const titleElements = parseHTML(element.html, 'h3.truyen-title a, .truyen-title a');
                    if (!titleElements || titleElements.length === 0) {
                        console.log('No title found in element ' + i);
                        continue;
                    }
                    
                    const titleElement = titleElements[0];
                    const title = titleElement.text ? titleElement.text.trim() : '';
                    const novelURL = this.resolveURL(titleElement.href);
                    
                    if (!title || !novelURL) {
                        continue;
                    }
                    
                    let author = null;
                    const authorElements = parseHTML(element.html, '.author');
                    if (authorElements && authorElements.length > 0) {
                        const authorElement = authorElements[0];
                        const authorText = authorElement.text || authorElement.textContent || authorElement.innerText;
                        
                        if (authorText && authorText.trim()) {
                            author = authorText.trim()
                                .replace(/^\s*📝\s*/, '')
                                .replace(/\s+/g, ' ')
                                .trim();
                            
                            if (!author || author.length < 2) {
                                author = null;
                            }
                        }
                    }
                    
                    let coverURL = null;
                    const coverElements = parseHTML(element.html, '.book img, .cover img, img');
                    if (coverElements && coverElements.length > 0) {
                        for (const coverElement of coverElements) {
                            const src = coverElement.src || coverElement['data-src'];
                            if (src && src.includes('uploads')) {
                                coverURL = this.resolveURL(src);
                                break;
                            }
                        }
                    }
                    
                    const novel = {
                        id: 'novelfull_' + Date.now() + '_' + i,
                        title: title,
                        author: author,
                        synopsis: null,
                        coverImageURL: coverURL,
                        sourcePlugin: this.id,
                        novelURL: novelURL
                    };
                    
                    novels.push(novel);
                    
                } catch (error) {
                    console.log('Error parsing novel element ' + i + ': ' + error);
                }
            }
            
            console.log('Successfully parsed ' + novels.length + ' novels');
            return novels;
            
        } catch (error) {
            console.log('Error parsing novel list: ' + error);
            return [];
        }
    }

    resolveURL(url) {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return this.baseURL + url;
        return url;
    }

    async fetchNovelDetails(novelURL) {
        try {
            console.log('Fetching novel details from: ' + novelURL);
            const html = await fetch(novelURL);
            
            const titleElements = parseHTML(html, '.books .desc h3.title, h3.title');
            const title = (titleElements && titleElements.length > 0 && titleElements[0].text) ? 
                titleElements[0].text.trim() : 'Unknown Title';
            
            let author = null;
            const authorLinkElements = parseHTML(html, '.info a[href*="author"]');
            if (authorLinkElements && authorLinkElements.length > 0) {
                author = authorLinkElements[0].text ? authorLinkElements[0].text.trim() : null;
            }
            
            const synopsisElements = parseHTML(html, '.desc-text');
            const synopsis = (synopsisElements && synopsisElements.length > 0 && synopsisElements[0].text) ?
                synopsisElements[0].text.trim() : 'No synopsis available';
            
            let coverURL = null;
            const coverElements = parseHTML(html, '.books .book img');
            if (coverElements && coverElements.length > 0) {
                const coverElement = coverElements[0];
                const src = coverElement.src || coverElement['data-src'];
                if (src && src.includes('uploads')) {
                    coverURL = this.resolveURL(src);
                }
            }
            
            console.log('Starting SMART chapter fetch for: ' + title);
            const chapters = await this.fetchAllChaptersSmart(html, novelURL);
            
            const novel = {
                id: 'novelfull_' + Date.now(),
                title: title,
                author: author,
                synopsis: synopsis,
                coverImageURL: coverURL,
                sourcePlugin: this.id,
                novelURL: novelURL
            };
            
            console.log('Total chapters found: ' + chapters.length);
            
            const result = {
                novel: novel,
                chapters: chapters,
                totalChapters: chapters.length,
                lastUpdated: new Date()
            };
            
            return result;
            
        } catch (error) {
            console.log('Error fetching novel details: ' + error);
            throw error;
        }
    }

    async fetchAllChaptersSmart(firstPageHtml, novelURL) {
        let allChapters = [];
        const seenChapterUrls = new Set();     // Track URLs to prevent duplicates
        const seenChapterNumbers = new Set();  // Track chapter numbers for additional safety
        
        try {
            console.log('Starting SMART chapter fetching with overlap detection...');
            
            // Parse first page chapters
            const firstPageChapters = this.parseChapterListSmart(firstPageHtml, novelURL, seenChapterUrls, seenChapterNumbers);
            console.log('Page 1: Found ' + firstPageChapters.length + ' NEW chapters (after overlap detection)');
            
            // Add first page chapters
            allChapters = allChapters.concat(firstPageChapters);
            console.log('After page 1: ' + allChapters.length + ' total chapters');
            
            // Determine total pages
            const totalPages = this.getTotalPages(firstPageHtml);
            console.log('Detected ' + totalPages + ' total pages of chapters');
            
            if (totalPages <= 1) {
                console.log('Single page novel - final count: ' + allChapters.length + ' chapters');
                return this.sortChaptersByNumber(allChapters);
            }
            
            // Fetch remaining pages with smart overlap detection
            for (let page = 2; page <= totalPages; page++) {
                try {
                    const pageURL = novelURL + '?page=' + page;
                    console.log('Fetching page ' + page + ': ' + pageURL);
                    
                    const pageHtml = await fetch(pageURL);
                    const pageChapters = this.parseChapterListSmart(pageHtml, novelURL, seenChapterUrls, seenChapterNumbers);
                    
                    console.log('Page ' + page + ': Found ' + pageChapters.length + ' NEW chapters (after overlap detection)');
                    
                    // Add new chapters
                    allChapters = allChapters.concat(pageChapters);
                    console.log('After page ' + page + ': ' + allChapters.length + ' total chapters');
                    
                    // If page returned no NEW chapters, likely reached the end or all overlaps
                    if (pageChapters.length === 0) {
                        console.log('Page ' + page + ' returned no new chapters - likely reached end or all overlaps');
                        break;
                    }
                    
                } catch (error) {
                    console.log('Error fetching page ' + page + ': ' + error);
                    // Continue with next page
                }
            }
            
            const sortedChapters = this.sortChaptersByNumber(allChapters);
            console.log('SMART fetch finished! Total unique chapters: ' + sortedChapters.length);
            return sortedChapters;
            
        } catch (error) {
            console.log('Error in fetchAllChaptersSmart: ' + error);
            return this.sortChaptersByNumber(allChapters);
        }
    }

    getTotalPages(html) {
        let totalPages = 1;
        
        const allPaginationElements = parseHTML(html, '.pagination a, .paging a, .page-numbers a, a[href*="page="]');
        
        if (allPaginationElements && allPaginationElements.length > 0) {
            for (const element of allPaginationElements) {
                if (element.href && element.href.includes('page=')) {
                    const pageMatch = element.href.match(/page=(\d+)/);
                    if (pageMatch) {
                        const pageNum = parseInt(pageMatch[1]);
                        if (pageNum > 0 && pageNum < 500) {
                            totalPages = Math.max(totalPages, pageNum);
                        }
                    }
                }
                
                if (element.text && /^\d+$/.test(element.text.trim())) {
                    const pageNum = parseInt(element.text.trim());
                    if (pageNum > 0 && pageNum < 500) {
                        totalPages = Math.max(totalPages, pageNum);
                    }
                }
            }
        }
        
        // Safety limit
        if (totalPages > 100) {
            console.log('Detected ' + totalPages + ' pages - limiting to 100 for safety');
            totalPages = 100;
        }
        
        return totalPages;
    }
    
    // SMART: Parse all chapters but skip ones we've already seen
    parseChapterListSmart(html, novelURL, seenChapterUrls, seenChapterNumbers) {
        const newChapters = [];
        
        // Try different selectors and use the one that finds the most chapters
        const selectors = [
            'ul li a[href*="chapter-"]:not([href*="edit"]):not([href*="report"]):not([class*="btn"])',
            'li a[href*="chapter-"]:not([href*="edit"]):not([class*="btn"])',
            '#list-chapter a[href*="chapter-"]',
            '.list-chapter a[href*="chapter-"]',
            'a[href*="/chapter-"]:not([href*="edit"])',
            '.chapter-list a[href*="chapter-"]'
        ];
        
        let chapterElements = [];
        let selectedSelector = '';
        
        // Find the selector that returns the most chapter elements
        for (const selector of selectors) {
            const elements = parseHTML(html, selector);
            if (elements && elements.length > chapterElements.length) {
                chapterElements = elements;
                selectedSelector = selector;
            }
        }
        
        if (!chapterElements || chapterElements.length === 0) {
            console.log('SMART: No chapter elements found with any selector');
            return newChapters;
        }
        
        console.log('SMART: Using selector "' + selectedSelector + '" found ' + chapterElements.length + ' total elements');
        
        let processedCount = 0;
        let skippedCount = 0;
        let addedCount = 0;
        
        // Process ALL chapters but skip duplicates
        for (let i = 0; i < chapterElements.length; i++) {
            const element = chapterElements[i];
            processedCount++;
            
            try {
                const chapterTitle = (element.text) ? element.text.trim() : ('Chapter ' + (i + 1));
                const chapterURL = this.resolveURL(element.href);
                
                if (!chapterURL || !chapterURL.includes('chapter-')) {
                    continue;
                }
                
                // Check if we've already seen this chapter URL
                const urlKey = chapterURL.toLowerCase();
                if (seenChapterUrls.has(urlKey)) {
                    skippedCount++;
                    console.log('SMART: Skipping duplicate URL: ' + chapterTitle + ' -> ' + chapterURL);
                    continue;
                }
                
                let chapterNumber = this.extractChapterNumber(chapterTitle, chapterURL, i + 1);
                
                // Check if we've already seen this chapter number (additional safety)
                if (seenChapterNumbers.has(chapterNumber)) {
                    skippedCount++;
                    console.log('SMART: Skipping duplicate chapter number: ' + chapterNumber + ' -> ' + chapterTitle);
                    continue;
                }
                
                // This is a NEW chapter - add it
                seenChapterUrls.add(urlKey);
                seenChapterNumbers.add(chapterNumber);
                
                const urlSlug = chapterURL.split('/').pop() || chapterNumber;
                
                const chapter = {
                    id: 'chapter_' + chapterNumber + '_' + urlSlug,
                    title: chapterTitle,
                    novelId: novelURL,
                    chapterNumber: chapterNumber,
                    url: chapterURL,
                    content: null,
                    isDownloaded: false
                };
                
                newChapters.push(chapter);
                addedCount++;
                
                // Log first few and last few for debugging
                if (addedCount <= 3 || processedCount >= chapterElements.length - 3) {
                    console.log('SMART: Added NEW chapter ' + chapterNumber + ': ' + chapterTitle);
                }
                
            } catch (error) {
                console.log('Error parsing chapter ' + i + ': ' + error);
            }
        }
        
        console.log('SMART: Processed ' + processedCount + ' elements -> Added ' + addedCount + ' new, Skipped ' + skippedCount + ' duplicates');
        console.log('SMART: This page contributed ' + newChapters.length + ' NEW chapters');
        
        return newChapters;
    }

    extractChapterNumber(title, url, fallback) {
        const titlePatterns = [
            /chapter\s*(\d+)/i,
            /ch\s*(\d+)/i,
            /^(\d+)[:.\-\s]/,
            /\((\d+)\)/,
            /\[(\d+)\]/,
            /\b(\d+)\b/
        ];
        
        for (const regex of titlePatterns) {
            const match = title.match(regex);
            if (match && parseInt(match[1]) > 0) {
                const num = parseInt(match[1]);
                if (num < 10000) {
                    return num;
                }
            }
        }
        
        const urlPatterns = [
            /chapter[_-](\d+)/i,
            /ch[_-](\d+)/i,
            /\/(\d+)[_-]/,
            /[_-](\d+)\.html/i,
            /[_-](\d+)$/
        ];
        
        for (const regex of urlPatterns) {
            const match = url.match(regex);
            if (match && parseInt(match[1]) > 0) {
                const num = parseInt(match[1]);
                if (num < 10000) {
                    return num;
                }
            }
        }
        
        return fallback;
    }

    sortChaptersByNumber(chapters) {
        return chapters.sort((a, b) => {
            const numA = a.chapterNumber || 0;
            const numB = b.chapterNumber || 0;
            
            if (numA !== numB) {
                return numA - numB;
            }
            
            return a.title.localeCompare(b.title);
        });
    }

    async fetchChapterContent(chapterURL) {
        try {
            console.log('Fetching chapter content from: ' + chapterURL);
            const html = await fetch(chapterURL);
            
            const contentSelectors = [
                '#chapter-content',
                '.chapter-content', 
                '.chapter-c',
                '.content',
                '.chapter-body',
                '.chapter-text'
            ];
            
            for (const selector of contentSelectors) {
                const contentElements = parseHTML(html, selector);
                if (contentElements && contentElements.length > 0 && contentElements[0].text) {
                    const content = contentElements[0].text.trim();
                    if (content.length > 100) {
                        return {
                            content: content,
                            url: chapterURL,
                            sourcePlugin: this.id
                        };
                    }
                }
            }
            
            return {
                content: 'Chapter content could not be loaded',
                url: chapterURL,
                sourcePlugin: this.id
            };
            
        } catch (error) {
            console.log('Error fetching chapter content: ' + error);
            return {
                content: 'Failed to load chapter content',
                url: chapterURL,
                sourcePlugin: this.id
            };
        }
    }
}
