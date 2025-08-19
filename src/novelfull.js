// @id novelfull
  // @name NovelFull
  // @version 1.0.9
  // @description Read novels from NovelFull.net with FIXED selector 
  priority - exactly 50 chapters per page
  // @author khairil4565
  // @website https://novelfull.net

  class NovelFullPlugin extends BasePlugin {
      constructor(config) {
          super(config);
          this.baseURL = 'https://novelfull.net';
          this.maxConcurrentRequests = 6; // Reduced for stability
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
                      url =
  `${this.baseURL}/search?keyword=${encodeURIComponent(query)}`;
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
              const elementsToProcess = Math.min(novelElements.length, 10);

              for (let i = 0; i < elementsToProcess; i++) {
                  try {
                      const element = novelElements[i];

                      const titleElements = parseHTML(element.html,
  'h3.truyen-title a, .truyen-title a');
                      if (!titleElements || titleElements.length === 0) {
                          console.log(`No title found in element ${i}`);
                          continue;
                      }

                      const titleElement = titleElements[0];
                      const title = titleElement.text ?
  titleElement.text.trim() : '';
                      const novelURL = this.resolveURL(titleElement.href);

                      if (!title || !novelURL) {
                          console.log(`Skipping element ${i}: 
  title="${title}", url="${novelURL}"`);
                          continue;
                      }

                      let author = null;
                      const authorElements = parseHTML(element.html,
  '.author');
                      if (authorElements && authorElements.length > 0) {
                          const authorElement = authorElements[0];
                          const authorText = authorElement.text ||
  authorElement.textContent || authorElement.innerText;

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
                      const coverElements = parseHTML(element.html, '.book 
  img, .cover img, img');
                      if (coverElements && coverElements.length > 0) {
                          for (const coverElement of coverElements) {
                              const src = coverElement.src ||
  coverElement['data-src'];
                              if (src && src.includes('uploads')) {
                                  coverURL = this.resolveURL(src);
                                  console.log(`Found cover for ${title}: 
  ${coverURL}`);
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
                      console.log(`Added novel: "${title}" by ${author || 
  'Unknown'}`);

                  } catch (error) {
                      console.log(`Error parsing novel element ${i}: 
  ${error}`);
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

              const titleElements = parseHTML(html, '.books .desc h3.title,
   h3.title');
              const title = (titleElements && titleElements.length > 0 &&
  titleElements[0].text) ?
                  titleElements[0].text.trim() : 'Unknown Title';

              let author = null;
              const authorLinkElements = parseHTML(html, '.info 
  a[href*="author"]');
              if (authorLinkElements && authorLinkElements.length > 0) {
                  author = authorLinkElements[0].text ?
  authorLinkElements[0].text.trim() : null;
              }

              const synopsisElements = parseHTML(html, '.desc-text');
              const synopsis = (synopsisElements && synopsisElements.length
   > 0 && synopsisElements[0].text) ?
                  synopsisElements[0].text.trim() : 'No synopsis 
  available';

              let coverURL = null;
              const coverElements = parseHTML(html, '.books .book img');
              if (coverElements && coverElements.length > 0) {
                  const coverElement = coverElements[0];
                  const src = coverElement.src || coverElement['data-src'];
                  if (src && src.includes('uploads')) {
                      coverURL = this.resolveURL(src);
                      console.log(`📸 Found cover from detail page: 
  ${coverURL}`);
                  }
              }

              console.log(`📚 Starting FIXED chapter fetch for: ${title}`);
              const chapters = await this.fetchAllChaptersFixed(html,
  novelURL);

              const novel = {
                  id: `novelfull_${Date.now()}`,
                  title: title,
                  author: author,
                  synopsis: synopsis,
                  coverImageURL: coverURL,
                  sourcePlugin: this.id,
                  novelURL: novelURL
              };

              console.log(`✅ Novel details parsed - Title: ${title}, 
  Author: ${author}, Cover: ${coverURL ? 'Found' : 'Not found'}`);
              console.log(`📊 Total chapters found: ${chapters.length}`);

              const result = {
                  novel: novel,
                  chapters: chapters,
                  totalChapters: chapters.length,
                  lastUpdated: new Date()
              };

              console.log(`🎉 Returning novel detail with 
  ${chapters.length} chapters`);
              return result;

          } catch (error) {
              console.log(`❌ Error fetching novel details: ${error}`);
              throw error;
          }
      }

      async fetchAllChaptersFixed(firstPageHtml, novelURL) {
          let allChapters = [];
          const seenUrls = new Set();
          const seenChapterNumbers = new Set();

          try {
              console.log('🚀 Starting FIXED chapter fetching with correct 
  selector priority...');

              // Parse first page chapters with FIXED selector logic
              const firstPageChapters =
  this.parseChapterListFixed(firstPageHtml, novelURL);
              console.log(`📖 Page 1: Found ${firstPageChapters.length} 
  chapters (FIXED)`);

              // Add first page chapters with deduplication
              for (const chapter of firstPageChapters) {
                  const urlKey = chapter.url.toLowerCase();
                  if (!seenUrls.has(urlKey) &&
  !seenChapterNumbers.has(chapter.chapterNumber)) {
                      seenUrls.add(urlKey);
                      seenChapterNumbers.add(chapter.chapterNumber);
                      allChapters.push(chapter);
                  }
              }

              console.log(`📊 After first page: ${allChapters.length} 
  unique chapters`);

              // Determine total pages with enhanced detection
              const totalPages = this.getTotalPagesEnhanced(firstPageHtml);
              console.log(`📄 Detected ${totalPages} total pages of 
  chapters`);

              if (totalPages <= 1) {
                  console.log(`✅ Single page novel - final count: 
  ${allChapters.length} chapters`);
                  return this.sortChaptersByNumber(allChapters);
              }

              // Sequential processing without setTimeout delays
              console.log(`🔄 Fetching ${totalPages - 1} additional pages 
  sequentially...`);

              const additionalChapters = await
  this.fetchAllPagesSequential(
                  2, totalPages, novelURL, seenUrls, seenChapterNumbers
              );
              allChapters = allChapters.concat(additionalChapters);

              console.log(`🎉 FIXED fetch finished! Total chapters: 
  ${allChapters.length}`);

              // Sort chapters by chapter number
              const sortedChapters =
  this.sortChaptersByNumber(allChapters);

              console.log(`✅ Final result: ${sortedChapters.length} 
  chapters sorted by number`);
              return sortedChapters;

          } catch (error) {
              console.log(`❌ Error in fetchAllChaptersFixed: ${error}`);
              return this.sortChaptersByNumber(allChapters);
          }
      }

      // Sequential processing without setTimeout
      async fetchAllPagesSequential(startPage, totalPages, novelURL, 
  seenUrls, seenChapterNumbers) {
          const allChapters = [];
          const BATCH_SIZE = 6; // Smaller batches for better reliability

          for (let batchStart = startPage; batchStart <= totalPages;
  batchStart += BATCH_SIZE) {
              const batchEnd = Math.min(batchStart + BATCH_SIZE - 1,
  totalPages);
              const batch = [];

              for (let page = batchStart; page <= batchEnd; page++) {
                  batch.push(page);
              }

              const batchNum = Math.floor((batchStart - startPage) /
  BATCH_SIZE) + 1;
              const totalBatches = Math.ceil((totalPages - startPage + 1) /
   BATCH_SIZE);

              console.log(`📦 Batch ${batchNum}/${totalBatches}: fetching 
  pages ${batchStart}–${batchEnd} (${batch.length} pages)`);

              try {
                  const batchChapters = await
  this.fetchPageBatchSequential(batch, novelURL, seenUrls,
  seenChapterNumbers);
                  allChapters.push(...batchChapters);

                  console.log(`✅ Batch ${batchNum} complete: 
  +${batchChapters.length} chapters (total: ${allChapters.length})`);

              } catch (error) {
                  console.log(`❌ Error in batch ${batchStart}-${batchEnd}:
   ${error}`);
                  // Continue with next batch even if this one fails
              }
          }

          return allChapters;
      }

      // Batch processing with better error handling
      async fetchPageBatchSequential(pageNumbers, novelURL, seenUrls, 
  seenChapterNumbers) {
          const batchChapters = [];

          // Create promises for all pages in batch
          const promises = pageNumbers.map(async (pageNum) => {
              try {
                  const pageURL = `${novelURL}?page=${pageNum}`;
                  console.log(`🔍 Fetching page ${pageNum}: ${pageURL}`);

                  const pageHtml = await fetch(pageURL);
                  const chapters = this.parseChapterListFixed(pageHtml,
  novelURL); // Use FIXED parsing

                  console.log(`📖 Page ${pageNum}: Found ${chapters.length}
   chapters (FIXED)`);
                  return { pageNum, chapters: chapters, success: true };

              } catch (error) {
                  console.log(`❌ Error fetching page ${pageNum}: 
  ${error}`);
                  return { pageNum, chapters: [], success: false };
              }
          });

          // Wait for all pages in batch to complete
          const results = await Promise.all(promises);

          // Sort results by page number
          results.sort((a, b) => a.pageNum - b.pageNum);

          // Process results and add unique chapters
          for (const { pageNum, chapters, success } of results) {
              if (!success) {
                  console.log(`⚠️ Page ${pageNum}: Skipped due to fetch 
  error`);
                  continue;
              }

              let uniqueCount = 0;
              for (const chapter of chapters) {
                  const urlKey = chapter.url.toLowerCase();
                  if (!seenUrls.has(urlKey) &&
  !seenChapterNumbers.has(chapter.chapterNumber)) {
                      seenUrls.add(urlKey);
                      seenChapterNumbers.add(chapter.chapterNumber);
                      batchChapters.push(chapter);
                      uniqueCount++;
                  }
              }

              if (chapters.length > 0) {
                  console.log(`📖 Page ${pageNum}: Added 
  ${uniqueCount}/${chapters.length} unique chapters`);
              } else {
                  console.log(`⚠️ Page ${pageNum}: No chapters found 
  (possibly reached end)`);
              }
          }

          return batchChapters;
      }

      // ENHANCED: Better pagination detection
      getTotalPagesEnhanced(html) {
          let totalPages = 1;

          console.log(`🔍 Detecting total pages...`);

          // Method 1: Look for "Last" button or highest numbered link
          const allPaginationElements = parseHTML(html, '.pagination a, 
  .paging a, .page-numbers a, a[href*="page="]');

          if (allPaginationElements && allPaginationElements.length > 0) {
              console.log(`🔍 Found ${allPaginationElements.length} 
  pagination elements`);

              for (const element of allPaginationElements) {
                  if (element.href && element.href.includes('page=')) {
                      const pageMatch = element.href.match(/page=(\d+)/);
                      if (pageMatch) {
                          const pageNum = parseInt(pageMatch[1]);
                          if (pageNum > 0 && pageNum < 500) { // Reasonable
   upper limit
                              totalPages = Math.max(totalPages, pageNum);
                              console.log(`🔍 Found page link: page 
  ${pageNum}`);
                          }
                      }
                  }

                  // Also check text content for numbers
                  if (element.text && /^\d+$/.test(element.text.trim())) {
                      const pageNum = parseInt(element.text.trim());
                      if (pageNum > 0 && pageNum < 500) {
                          totalPages = Math.max(totalPages, pageNum);
                          console.log(`🔍 Found page number in text: 
  ${pageNum}`);
                      }
                  }
              }
          }

          // Method 2: Look for page info text like "Page 1 of 44"
          const pageInfoElements = parseHTML(html, '.pagination, .paging, 
  .page-info, .chapter-pagination');
          if (pageInfoElements && pageInfoElements.length > 0) {
              for (const element of pageInfoElements) {
                  if (element.text) {
                      const pageInfoMatches = [
                          /page\s+\d+\s+of\s+(\d+)/i,
                          /(\d+)\s+pages?/i,
                          /total\s+(\d+)\s+pages?/i
                      ];

                      for (const regex of pageInfoMatches) {
                          const match = element.text.match(regex);
                          if (match) {
                              const pageNum = parseInt(match[1]);
                              if (pageNum > totalPages && pageNum < 500) {
                                  totalPages = pageNum;
                                  console.log(`🔍 Found page info: 
  "${element.text}" -> ${totalPages} pages`);
                              }
                          }
                      }
                  }
              }
          }

          // Safety check and final validation
          if (totalPages > 200) {
              console.log(`⚠️ Detected ${totalPages} pages - limiting to 
  200 for safety`);
              totalPages = 200;
          }

          console.log(`📊 Final page count determination: ${totalPages} 
  pages`);
          return totalPages;
      }

      // 🔥 FIXED: Chapter parsing with CORRECT selector priority
      parseChapterListFixed(html, novelURL) {
          const chapters = [];

          // 🎯 FIXED: Prioritize selectors that return exactly 50 chapters
          const selectors = [
              '#list-chapter a[href*="chapter-"]',
                                // Priority 1: Exact 50 chapters
              '.list-chapter a[href*="chapter-"]',
                                // Priority 2: Exact 50 chapters
              'ul li a[href*="chapter-"]:not([href*="edit"]):not([href*="re
  port"]):not([class*="btn"])', // Fallback: 55 chapters
              'li 
  a[href*="chapter-"]:not([href*="edit"]):not([class*="btn"])',
                // Fallback: 55 chapters
              '.chapter-list a[href*="chapter-"]',
                                // Fallback: Usually 0
              'a[href*="/chapter-"]:not([href*="edit"])'
                               // Fallback: 55 chapters
          ];

          let chapterElements = [];
          let selectedSelector = '';

          console.log(`🔍 FIXED: Testing selectors with priority for 
  50-element results...`);

          // 🎯 FIXED LOGIC: Prioritize selectors that return exactly 50 
  elements
          for (const selector of selectors) {
              const elements = parseHTML(html, selector);
              console.log(`🔍 Selector "${selector}" found ${elements ? 
  elements.length : 0} elements`);

              if (!elements || elements.length === 0) {
                  continue;
              }

              // 🎯 KEY FIX: Prioritize exactly 50 elements (known correct 
  count)
              if (elements.length === 50) {
                  chapterElements = elements;
                  selectedSelector = selector;
                  console.log(`✅ FIXED: Using PRIORITY selector 
  "${selector}" with exactly 50 elements`);
                  break; // Stop here - we found the perfect selector
              }

              // Only use other selectors if we haven't found a 50-element 
  selector yet
              if (chapterElements.length === 0 && elements.length > 0) {
                  chapterElements = elements;
                  selectedSelector = selector;
                  console.log(`⚠️ FIXED: Using FALLBACK selector 
  "${selector}" with ${elements.length} elements`);
              }
          }

          if (!chapterElements || chapterElements.length === 0) {
              console.log(`❌ FIXED: No chapter elements found with any 
  selector`);
              return chapters;
          }

          console.log(`🔍 FIXED: Processing ${chapterElements.length} 
  chapter elements from selector: ${selectedSelector}`);

          for (let i = 0; i < chapterElements.length; i++) {
              const element = chapterElements[i];

              try {
                  const chapterTitle = (element.text) ? element.text.trim()
   : `Chapter ${i + 1}`;
                  const chapterURL = this.resolveURL(element.href);

                  if (!chapterURL || !chapterURL.includes('chapter-')) {
                      continue;
                  }

                  // Enhanced chapter number extraction
                  let chapterNumber =
  this.extractChapterNumber(chapterTitle, chapterURL, i + 1);

                  const urlSlug = chapterURL.split('/').pop() ||
  chapterNumber;

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
                  if (i < 3 || i >= chapterElements.length - 3) {
                      console.log(`📖 Chapter ${chapterNumber}: 
  ${chapterTitle} -> ${chapterURL}`);
                  }

              } catch (error) {
                  console.log(`❌ Error parsing chapter ${i}: ${error}`);
              }
          }

          console.log(`✅ FIXED: Successfully parsed ${chapters.length} 
  chapters from page`);
          return chapters;
      }

      extractChapterNumber(title, url, fallback) {
          // Enhanced extraction with more patterns
          const titlePatterns = [
              /chapter\s*(\d+)/i,
              /ch\s*(\d+)/i,
              /^(\d+)[:.\-\s]/,
              /\((\d+)\)/,
              /\[(\d+)\]/,
              /第(\d+)章/,
              /\b(\d+)\b/
          ];

          for (const regex of titlePatterns) {
              const match = title.match(regex);
              if (match && parseInt(match[1]) > 0) {
                  const num = parseInt(match[1]);
                  if (num < 10000) { // Reasonable upper limit
                      return num;
                  }
              }
          }

          // URL patterns
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
              console.log(`📖 Fetching chapter content from: 
  ${chapterURL}`);
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
                  if (contentElements && contentElements.length > 0 &&
  contentElements[0].text) {
                      const content = contentElements[0].text.trim();
                      if (content.length > 100) {
                          console.log(`✅ Chapter content loaded: 
  ${content.length} characters`);
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
