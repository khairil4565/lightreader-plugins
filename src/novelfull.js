// @id novelfull
// @name NovelFull
// @version 1.0.2
// @description Read novels from NovelFull.net with fixed cover image handling
// @author khairil4565
// @website https://novelfull.net

class NovelFullPlugin extends BasePlugin {
    constructor(config) {
        super(config);
        this.baseURL = 'https://novelfull.net';
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
                                // Keep as thumbnail URL - it works better than converted ones
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
            console.log(`Fetching novel details from: ${novelURL}`);
            const html = await fetch(novelURL);
            
            // Parse title - correct selector for detail page
            const titleElements = parseHTML(html, '.books .desc h3.title, h3.title');
            const title = (titleElements && titleElements.length > 0 && titleElements[0].text) ? 
                titleElements[0].text.trim() : 'Unknown Title';
            
            // Parse author - look for author links in info section
            let author = null;
            const authorLinkElements = parseHTML(html, '.info a[href*="author"]');
            if (authorLinkElements && authorLinkElements.length > 0) {
                author = authorLinkElements[0].text ? authorLinkElements[0].text.trim() : null;
            }
            
            // Parse synopsis
            const synopsisElements = parseHTML(html, '.desc-text');
            const synopsis = (synopsisElements && synopsisElements.length > 0 && synopsisElements[0].text) ?
                synopsisElements[0].text.trim() : 'No synopsis available';
            
            // Parse cover - get the actual cover from detail page
            let coverURL = null;
            const coverElements = parseHTML(html, '.books .book img');
            if (coverElements && coverElements.length > 0) {
                const coverElement = coverElements[0];
                const src = coverElement.src || coverElement['data-src'];
                if (src && src.includes('uploads')) {
                    coverURL = this.resolveURL(src);
                    console.log(`Found cover from detail page: ${coverURL}`);
                }
            }
            
            // Parse chapters
            const chapters = this.parseChapterList(html, novelURL);
            
            const novel = {
                id: `novelfull_${Date.now()}`,
                title: title,
                author: author,
                synopsis: synopsis,
                coverImageURL: coverURL,
                sourcePlugin: this.id,
                novelURL: novelURL
            };
            
            console.log(`Novel details parsed - Title: ${title}, Author: ${author}, Cover: ${coverURL ? 'Found' : 'Not found'}`);
            console.log(`Chapters found: ${chapters.length}`);
            
            // Return the structured response that Swift expects
            const result = {
                novel: novel,
                chapters: chapters,
                totalChapters: chapters.length,
                lastUpdated: new Date()
            };
            
            console.log(`Returning novel detail with structure:`, Object.keys(result));
            return result;
            
        } catch (error) {
            console.log(`Error fetching novel details: ${error}`);
            throw error;
        }
    }

    parseChapterList(html, novelURL) {
        const chapters = [];
        const chapterElements = parseHTML(html, '#list-chapter .row a, .chapter-list a, .list-chapter a');
        
        for (let i = 0; i < chapterElements.length; i++) {
            const element = chapterElements[i];
            
            try {
                const chapterTitle = (element.text) ? element.text.trim() : `Chapter ${i + 1}`;
                const chapterURL = this.resolveURL(element.href);
                
                if (!chapterURL) continue;
                
                let chapterNumber = i + 1;
                const numberMatch = chapterTitle.match(/\d+/);
                if (numberMatch) {
                    chapterNumber = parseInt(numberMatch[0]);
                }
                
                const chapter = {
                    id: `chapter_${Date.now()}_${i}`,
                    title: chapterTitle,
                    novelId: novelURL,
                    chapterNumber: chapterNumber,
                    url: chapterURL,
                    content: null,
                    isDownloaded: false
                };
                
                chapters.push(chapter);
                
            } catch (error) {
                console.log(`Error parsing chapter ${i}: ${error}`);
            }
        }
        
        console.log(`Parsed ${chapters.length} chapters`);
        return chapters;
    }

    async fetchChapterContent(chapterURL) {
        try {
            console.log(`Fetching chapter content from: ${chapterURL}`);
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
                        return content;
                    }
                }
            }
            
            return 'Chapter content could not be loaded';
            
        } catch (error) {
            console.log(`Error fetching chapter content: ${error}`);
            return 'Failed to load chapter content';
        }
    }
}
