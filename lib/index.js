#!/usr/bin/env node

/*!
 * Redgif
 * Copyright (c) 2023 to present.
 *
 * @author Zubin
 * @username (GitHub) losparviero
 * @license AGPL-3.0
 */

let cookies;

import { Buffer } from "node:buffer";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const apiUrl = "https://api.redgifs.com";

async function accessToken() {
  try {
    const response = await fetch(apiUrl + "/v2/auth/temporary");
    const data = await response.json();
    cookies = response.headers.get("set-cookie");
    console.log("Obtained access token.");
    return data.token;
  } catch (error) {
    throw new Error("Error getting token.");
  }
}

async function getGif(gifId, quality = 'hd') {
  try {
    const response = await fetch(apiUrl + `/v2/gifs/${gifId}`, {
      headers: {
      Authorization: `Bearer ${await accessToken()}`,
        Cookie: cookies,
      },
    });
    const data = await response.json();
    let downloadUrl;

    if (data?.error) {
      throw new Error(`${data.error.description}`);
        } else if (quality === 'hd' && data.gif?.urls?.hd) {
      downloadUrl = data.gif.urls.hd;
        } else if (quality === 'sd' && data.gif?.urls?.sd) {
      downloadUrl = data.gif.urls.sd;
        } else if (data.gif?.urls?.hd) {
      downloadUrl = data.gif.urls.hd;
        } else if (data.gif?.urls?.sd) {
      downloadUrl = data.gif.urls.sd;
        }

    const video = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        Cookie: cookies,
      },
    });

    if (video.ok) {
      const buffer = Buffer.from(await video.arrayBuffer());
      return buffer;
    } else {
      throw new Error("Error downloading gif.");
    }
  } catch (error) {
    throw new Error(`Error getting gif:\n${error}`);
  }
}

async function searchCreator(
  username,
  { page = 1, count = 80, order = "recent", type = "g" } = {}
) {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      count: count.toString(),
      order: order,
      type: type,
    });

    const response = await fetch(
      `${apiUrl}/v2/users/${username}/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          Cookie: cookies,
        },
      }
    );

    const data = await response.json();

    if (data?.error) {
      throw new Error(`${data.error.description}`);
    }

    return data;
  } catch (error) {
    throw new Error(`Error searching creator:\n${error}`);
  }
}


async function downloadCreatorGifs(
  username,
  { downloadDir = "downloads", order = "recent", type = "g", limit = null, quality = "sd" } = {}
) {
  try {
    // Get initial creator data
    let data = await searchCreator(username, { page: 1, order, type });
    
    if (!data.gifs || data.gifs.length === 0) {
      throw new Error("No gifs found for this creator.");
    }

    const totalPages = data.pages || 1;
    let currentPage = data.page || 1;
    let totalDownloaded = 0;
    const totalGifs = data.total || 0;
    const maxDownloads = limit ? Math.min(limit, totalGifs) : totalGifs;
    const downloadedIds = [];
    const filePaths = [];


    console.log(`Found ${totalGifs} gifs from creator: ${username}`);
    console.log(`${limit ? `Downloading up to ${maxDownloads} gifs` : `Downloading all gifs`}`);
    console.log(`Total pages: ${totalPages}`);

    while (currentPage <= totalPages) {
      for (let i = 0; i < data.gifs.length; i++) {
        // Check if we've reached the limit
        if (limit && totalDownloaded >= limit) {
          console.log(`Reached download limit of ${limit} gifs.`);
          return { downloaded: totalDownloaded, total: totalGifs, gifIds: downloadedIds, filePaths: filePaths };
        }

        const gif = data.gifs[i];
        totalDownloaded++;

        try {
            // Get the gif buffer using getGif
            const buffer = await getGif(gif.id, quality);
            
            // Create filename with gif ID to avoid duplicates
            const filename = `${gif.id || totalDownloaded}.mp4`;
            const filepath = join(downloadDir, username, filename);

            // Ensure directory exists
            await mkdir(dirname(filepath), { recursive: true });
            
            // Write file to disk
            await writeFile(filepath, buffer);

            // Track downloaded gif IDs
            downloadedIds.push(gif.id);
            filePaths.push(filepath);

          console.log(`Downloaded ${totalDownloaded} out of ${maxDownloads}`);
        } catch (error) {
          console.error(`Error downloading gif ${totalDownloaded}:`, error.message);
          // Continue with next gif instead of stopping
        }
      }

      // If we are in the last page, break the loop
      if (currentPage === totalPages) {
        break;
      }

      // Move to next page
      currentPage++;
      data = await searchCreator(username, { page: currentPage, order, type });
    }

    console.log("Completed!");
    return { gifIds: downloadedIds, downloaded: totalDownloaded, total: totalGifs, filePaths: filePaths };
  } catch (error) {
    throw new Error(`Error downloading creator gifs:\n${error}`);
  }
}

export { accessToken, getGif, searchCreator, downloadCreatorGifs };
