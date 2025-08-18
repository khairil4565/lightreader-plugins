// @id novelfull
// @name NovelFull
// @version 1.0.7
// @description Read novels from NovelFull.net with unlimited chapter fetching
// @author khairil4565
// @website https://novelfull.net

class NovelFullPlugin extends BasePlugin {
    constructor(config) {
        super(config);
        this.baseURL = 'https://novelfull.net';
        this.maxConcurrentRequests = 8; // Increased for faster processing
        // REMOVED: this.chaptersPerPage = 50; // This was limiting chapters!
    }

    async searchNovels(query) {
        console.log(`Searching for: ${query}`);
        
        try {
            let url;
            
            switch(query.toLowerCase()) {
                case 'popular':
                    url = `${this.baseURL}/most-popular`;
                    break;
                case 'latest':
                    url = `${this.baseURL}/latest-release-novel`;
                    break;
                case 'hot':
                    url = `${this.baseURL}/hot-novel`;
                    break;
                case 'completed':
                    url = `${this.baseURL}/completed-novel`;
                    break;
                default:
                    url = `${this.baseURL}/search?keyword=${encodeURIComponent(query)}`;
            }
            
            console.log(`Fetching from URL: ${url}`);
            const html = await fetch(url);
            
            return this.parseNovelList(html, query);
            
        } catch (error) {
            console.log(`Error searching novels: ${error}`);
            return [];
        }
    }

    async parseNovelList(html, queryType) {
        try {
            const selector = '.list.list-truyen .row';
            
            console.log(`Using selector: ${selector}`);
            const novelElements = parseHTML(html, selector);
            console.log(`Found ${novelElements.length} novel elements`);
            
            const novels = [];
            
            // Process first 10 novels for better performance
            const elementsToProcess = Math.min(novelElements.length, 10);
            
            for (let i = 0; i < elementsToProcess; i++) {
                try {
                    const element = novelElements[i];
                    
                    // Get title and URL
                    const titleElements = parseHTML(element.html, 'h3.truyen-title a, .truyen-title a');
                    if (!titleElements || titleElements.length === 0) {
                        console.log(`No title found in element ${i}`);
                        continue;
                    }
                    
                    const titleElement = titleElements[0];
                    const title = titleElement.text ? titleElement.text.trim() : '';
                    const novelURL = this.resolveURL(titleElement.href);
                    
                    if (!title || !novelURL) {
                        console.log(`Skipping element ${i}: title="${title}", url="${novelURL}"`);
                        continue;
                    }
                    
                    // Get author from current page
                    let author = null;
                    const authorElements = parseHTML(element.html, '.author');
                    if (authorElements && authorElements.length > 0) {
                        const authorElement = authorElements[0];
                        const authorText = authorElement.text || authorElement.textContent || authorElement.innerText;
                        
                        if (authorText && authorText.trim()) {
                            author = authorText.trim()
                                .replace(/^\s*📝\s*/, '') // Remove pencil icon
                                .replace(/\s+/g, ' ')     // Normalize whitespace
                                .trim();
                            
                            if (!author || author.length < 2) {
                                author = null;
                            }
                        }
                    }
                    
                    // Get cover image from list page
                    let coverURL = null;
                    const coverElements = parseHTML(element.html, '.book img, .cover img, img');
                    if (coverElements && coverElements.length > 0) {
                        for (const coverElement of coverElements) {
                            const src = coverElement.src || coverElement['data-src'];
                            if (src && src.includes('uploads')) {
                                coverURL = this.resolveURL(src);
                                console.log(`Found cover for ${title}: ${coverURL}`);
                                break;
                            }
                        }
                    }
                    
                    const novel = {
                        id: `novelfull_${Date.now()}_${i}`,
                        title: title,
                        author: author,
                        synopsis: null,
                        coverImageURL: coverURL,
                        sourcePlugin: this.id,
                        novelURL: novelURL
                    };
                    
                    novels.push(novel);
                    console.log(`Added novel: "${title}" by ${author || 'Unknown'} with cover: ${coverURL ? 'Yes' : 'No'}`);
                    
                } catch (error) {
                    console.log(`Error parsing novel element ${i}: ${error}`);
                }
            }
            
            console.log(`Successfully parsed ${novels.length} novels`);
            return novels;
            
        } catch (error) {
            console.log(`Error parsing novel list: ${error}`);
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
            console.log(`🔍 Fetching novel details from: ${novelURL}`);
            const html = await fetch(novelURL);
            
            // Parse basic novel info
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
                    console.log(`📸 Found cover from detail page: ${coverURL}`);
                }
            }
            
            // 🔥 FIXED: Fetch ALL chapters without artificial limits
            console.log(`📚 Starting unlimited chapter fetch for: ${title}`);
            const chapters = await this.fetchAllChaptersUnlimited(html, novelURL);
            
            const novel = {
                id: `novelfull_${Date.now()}`,
                title: title,
                author: author,
                synopsis: synopsis,
                coverImageURL: coverURL,
                sourcePlugin: this.id,
                novelURL: novelURL
            };
            
            console.log(`✅ Novel details parsed - Title: ${title}, Author: ${author}, Cover: ${coverURL ? 'Found' : 'Not found'}`);
            console.log(`📊 Total chapters found: ${chapters.length}`);
            
            const result = {
                novel: novel,
                chapters: chapters,
                totalChapters: chapters.length,
                lastUpdated: new Date()
            };
            
            console.log(`🎉 Returning novel detail with ${chapters.length} chapters`);
            return result;
            
        } catch (error) {
            console.log(`❌ Error fetching novel details: ${error}`);
            throw error;
        }
    }

    // 🔥 NEW: Unlimited chapter fetching (no artificial limits)
    async fetchAllChaptersUnlimited(firstPageHtml, novelURL) {
        let allChapters = [];
        const seenUrls = new Set(); // URL-based deduplication
        const seenChapterNumbers = new Set(); // Number-based deduplication
        
        try {
            console.log('🚀 Starting unlimited chapter fetching...');
            
            // Parse first page chapters - NO LIMITS
            const firstPageChapters = this.parseChapterListUnlimited(firstPageHtml, novelURL);
            console.log(`📖 Page 1: Found ${firstPageChapters.length} chapters`);
            
            // Add first page chapters with deduplication
            for (const chapter of firstPageChapters) {
                const urlKey = chapter.url.toLowerCase();
                if (!seenUrls.has(urlKey) && !seenChapterNumbers.has(chapter.chapterNumber)) {
                    seenUrls.add(urlKey);
                    seenChapterNumbers.add(chapter.chapterNumber);
                    allChapters.push(chapter);
                }
            }
            
            console.log(`📊 After first page: ${allChapters.length} unique chapters`);
            
            // Determine total pages
            const totalPages = this.getTotalPagesEnhanced(firstPageHtml);
            console.log(`📄 Detected ${totalPages} total pages of chapters`);
            
            if (totalPages <= 1) {
                console.log(`✅ Single page novel - final count: ${allChapters.length} chapters`);
                return this.sortChaptersByNumber(allChapters);
            }
            
            // Fetch ALL remaining pages in optimized batches
            console.log(`🔄 Fetching ${totalPages - 1} additional pages...`);
            
            const additionalChapters = await this.fetchAllPagesUnlimited(
                2, totalPages, novelURL, seenUrls, seenChapterNumbers
            );
            allChapters = allChapters.concat(additionalChapters);
            
            console.log(`🎉 Unlimited fetch complete! Total chapters: ${allChapters.length}`);
            
            // Sort chapters by chapter number
            const sortedChapters = this.sortChaptersByNumber(allChapters);
            
            console.log(`✅ Final result: ${sortedChapters.length} chapters sorted by number`);
            return sortedChapters;
            
        } catch (error) {
            console.log(`❌ Error in fetchAllChaptersUnlimited: ${error}`);
            return this.sortChaptersByNumber(allChapters); // Return what we have
        }
    }

    // 🔥 NEW: Fetch all pages without limits
    async fetchAllPagesUnlimited(startPage, totalPages, novelURL, seenUrls, seenChapterNumbers) {
        const allChapters = [];
        const BATCH_SIZE = 8; // Process 8 pages at a time
        
        for (let batchStart = startPage; batchStart <= totalPages; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
            const batch = [];
            
            // Create batch array
            for (let page = batchStart; page <= batchEnd; page++) {
                batch.push(page);
            }
            
            const batchNum = Math.floor((batchStart - startPage) / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil((totalPages - startPage + 1) / BATCH_SIZE);
            
            console.log(`📦 Batch ${batchNum}/${totalBatches}: fetching pages ${batchStart}–${batchEnd}`);
            
            try {
                const batchChapters = await this.fetchPageBatchUnlimited(batch, novelURL, seenUrls, seenChapterNumbers);
                allChapters.push(...batchChapters);
                
                console.log(`✅ Batch ${batchNum} complete: +${batchChapters.length} chapters (total: ${allChapters.length})`);
                
                // Small delay between batches to be respectful
                if (batchEnd < totalPages) {
                    console.log('⏳ Waiting 1 second before next batch...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
            } catch (error) {
                console.log(`❌ Error in batch ${batchStart}-${batchEnd}: ${error}`);
                // Continue with next batch even if this one fails
            }
        }
        
        return allChapters;
    }

    // 🔥 NEW: Batch processing without limits
    async fetchPageBatchUnlimited(pageNumbers, novelURL, seenUrls, seenChapterNumbers) {
        const batchChapters = [];
        
        // Create promises for all pages in batch
        const promises = pageNumbers.map(async (pageNum) => {
            try {
                const pageURL = `${novelURL}?page=${pageNum}`;
                const pageHtml = await fetch(pageURL);
                const chapters = this.parseChapterListUnlimited(pageHtml, novelURL);
                
                // 🔥 REMOVED: Artificial limit - get ALL chapters from page
                // const limitedChapters = chapters.slice(0, this.chaptersPerPage);
                
                console.log(`📖 Page ${pageNum}: Found ${chapters.length} chapters`);
                return { pageNum, chapters: chapters }; // No limits!
                
            } catch (error) {
                console.log(`❌ Error fetching page ${pageNum}: ${error}`);
                return { pageNum, chapters: [] };
            }
        });
        
        // Wait for all pages in batch to complete
        const results = await Promise.all(promises);
        
        // Sort results by page number for consistent processing
        results.sort((a, b) => a.pageNum - b.pageNum);
        
        // Add unique chapters from each page
        for (const { pageNum, chapters } of results) {
            let uniqueCount = 0;
            for (const chapter of chapters) {
                const urlKey = chapter.url.toLowerCase();
                if (!seenUrls.has(urlKey) && !seenChapterNumbers.has(chapter.chapterNumber)) {
                    seenUrls.add(urlKey);
                    seenChapterNumbers.add(chapter.chapterNumber);
                    batchChapters.push(chapter);
                    uniqueCount++;
                }
            }
            if (chapters.length > 0) {
                console.log(`📖 Page ${pageNum}: Added ${uniqueCount}/${chapters.length} unique chapters`);
            }
        }
        
        return batchChapters;
    }

    // 🔥 NEW: Enhanced page detection
    getTotalPagesEnhanced(html) {
        let totalPages = 1;
        
        // Method 1: Look for "Last" button
        const lastButtonElements = parseHTML(html, '.pagination .last a, .pagination a:last-child');
        if (lastButtonElements && lastButtonElements.length > 0) {
            for (const element of lastButtonElements) {
                if (element.href && element.href.includes('page=')) {
                    const lastPageMatch = element.href.match(/page=(\d+)/);
                    if (lastPageMatch) {
                        totalPages = Math.max(totalPages, parseInt(lastPageMatch[1]));
                        console.log(`📄 Found "Last" button pointing to page ${totalPages}`);
                    }
                }
            }
        }
        
        // Method 2: Look for all numbered pagination links
        const paginationElements = parseHTML(html, '.pagination a');
        if (paginationElements && paginationElements.length > 0) {
            for (const element of paginationElements) {
                // Check href for page parameter
                if (element.href && element.href.includes('page=')) {
                    const pageMatch = element.href.match(/page=(\d+)/);
                    if (pageMatch) {
                        totalPages = Math.max(totalPages, parseInt(pageMatch[1]));
                    }
                }
                
                // Check text content for numbers
                if (element.text && /^\d+$/.test(element.text.trim())) {
                    const pageNum = parseInt(element.text.trim());
                    if (pageNum > 0 && pageNum < 1000) { // Reasonable upper limit
                        totalPages = Math.max(totalPages, pageNum);
                    }
                }
            }
        }
        
        // Method 3: Alternative pagination selectors
        const altPaginationElements = parseHTML(html, '.paging a, .page-numbers a, a[href*="page="]');
        if (altPaginationElements && altPaginationElements.length > 0) {
            for (const element of altPaginationElements) {
                if (element.href && element.href.includes('page=')) {
                    const pageMatch = element.href.match(/page=(\d+)/);
                    if (pageMatch) {
                        const pageNum = parseInt(pageMatch[1]);
                        if (pageNum > 0 && pageNum < 1000) {
                            totalPages = Math.max(totalPages, pageNum);
                        }
                    }
                }
            }
        }
        
        // Safety check: If we detect a very large number, limit it reasonably
        if (totalPages > 200) {
            console.log(`⚠️ Detected ${totalPages} pages - limiting to 200 for safety`);
            totalPages = 200;
        }
        
        console.log(`📊 Final page count: ${totalPages} pages`);
        return totalPages;
    }
    
    // 🔥 NEW: Unlimited chapter parsing (no artificial limits)
    parseChapterListUnlimited(html, novelURL) {
        const chapters = [];
        
        // Enhanced selector to catch ALL possible chapter links
        const chapterElements = parseHTML(html, 
            'ul li a[href*="chapter-"]:not([href*="edit"]):not([href*="report"]):not([class*="btn"]), ' +
            'li a[href*="chapter-"]:not([href*="edit"]):not([class*="btn"]), ' +
            '#list-chapter a[href*="chapter-"], ' +
            '.list-chapter a[href*="chapter-"], ' +
            '.chapter-list a[href*="chapter-"]'
        );
        
        console.log(`🔍 Found ${chapterElements.length} chapter elements with enhanced selector`);
        
        // 🔥 REMOVED: Artificial limit - process ALL elements found
        // const elementsToProcess = Math.min(chapterElements.length, this.chaptersPerPage);
        const elementsToProcess = chapterElements.length; // Process ALL!
        
        console.log(`🔍 Processing ALL ${elementsToProcess} chapter elements (no limits!)`);
        
        for (let i = 0; i < elementsToProcess; i++) {
            const element = chapterElements[i];
            
            try {
                const chapterTitle = (element.text) ? element.text.trim() : `Chapter ${i + 1}`;
                const chapterURL = this.resolveURL(element.href);
                
                if (!chapterURL) continue;
                
                // Enhanced chapter number extraction
                let chapterNumber = this.extractChapterNumber(chapterTitle, chapterURL, i + 1);
                
                // Create consistent ID
                const urlSlug = chapterURL.split('/').pop() || chapterNumber;
                
                const chapter = {
                    id: `chapter_${chapterNumber}_${urlSlug}`,
                    title: chapterTitle,
                    novelId: novelURL,
                    chapterNumber: chapterNumber,
                    url: chapterURL,
                    content: null,
                    isDownloaded: false
                };
                
                chapters.push(chapter);
                
                // Log first few and last few chapters for debugging
                if (i < 3 || i >= elementsToProcess - 3) {
                    console.log(`📖 Chapter ${chapterNumber}: ${chapterTitle} -> ${chapterURL}`);
                }
                
            } catch (error) {
                console.log(`❌ Error parsing chapter ${i}: ${error}`);
            }
        }
        
        console.log(`✅ Successfully parsed ${chapters.length} chapters from page (unlimited!)`);
        return chapters;
    }

    // 🔥 NEW: Enhanced chapter number extraction
    extractChapterNumber(title, url, fallback) {
        // Method 1: From title (Chapter 123, Ch 123, etc.)
        const titleMatches = [
            /chapter\s*(\d+)/i,
            /ch\s*(\d+)/i,
            /^(\d+)[:.\-\s]/,
            /\b(\d+)\b/
        ];
        
        for (const regex of titleMatches) {
            const match = title.match(regex);
            if (match && parseInt(match[1]) > 0) {
                return parseInt(match[1]);
            }
        }
        
        // Method 2: From URL (chapter-123.html)
        const urlMatches = [
            /chapter[_-](\d+)/i,
            /ch[_-](\d+)/i,
            /\/(\d+)[_-]/,
            /[_-](\d+)\.html/i
        ];
        
        for (const regex of urlMatches) {
            const match = url.match(regex);
            if (match && parseInt(match[1]) > 0) {
                return parseInt(match[1]);
            }
        }
        
        // Fallback: use position
        return fallback;
    }

    // 🔥 NEW: Smart chapter sorting
    sortChaptersByNumber(chapters) {
        return chapters.sort((a, b) => {
            const numA = a.chapterNumber || 0;
            const numB = b.chapterNumber || 0;
            
            // Sort by chapter number primarily
            if (numA !== numB) {
                return numA - numB;
            }
            
            // If same chapter number, sort by title
            return a.title.localeCompare(b.title);
        });
    }

    async fetchChapterContent(chapterURL) {
        try {
            console.log(`📖 Fetching chapter content from: ${chapterURL}`);
            const html = await fetch(chapterURL);
            
            const contentSelectors = [
                '#chapter-content',
                '.chapter-content', 
                '.chapter-c',
                '.content',
                '.chapter-body'
            ];
            
            for (const selector of contentSelectors) {
                const contentElements = parseHTML(html, selector);
                if (contentElements && contentElements.length > 0 && contentElements[0].text) {
                    const content = contentElements[0].text.trim();
                    if (content.length > 100) {
                        console.log(`✅ Chapter content loaded: ${content.length} characters`);
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
            console.log(`❌ Error fetching chapter content: ${error}`);
            return {
                content: 'Failed to load chapter content',
                url: chapterURL,
                sourcePlugin: this.id
            };
        }
    }
}
