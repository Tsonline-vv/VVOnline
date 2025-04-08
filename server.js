const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const app = express();

app.use(express.json());

const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Helper to download a file from a URL
async function downloadFile(url, filename) {
    const filePath = path.join(tempDir, filename);
    const writer = fs.createWriteStream(filePath);
    const response = await axios({ url, method: 'GET', responseType: 'stream' });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filePath));
        writer.on('error', reject);
    });
}

// Route 1: Merge Two Videos
app.post('/merge-videos', async (req, res) => {
    const { videoUrl1, videoUrl2 } = req.body;
    if (!videoUrl1 || !videoUrl2) return res.status(400).json({ error: 'videoUrl1 and videoUrl2 are required' });

    try {
        const id = uuidv4();
        const video1Path = await downloadFile(videoUrl1, `video1-${id}.mp4`);
        const video2Path = await downloadFile(videoUrl2, `video2-${id}.mp4`);
        const mergedPath = path.join(tempDir, `merged-${id}.mp4`);

        const concatListPath = path.join(tempDir, `concat-${id}.txt`);
        fs.writeFileSync(concatListPath, `file '${video1Path}'\nfile '${video2Path}'`);

        ffmpeg()
            .input(concatListPath)
            .inputOptions('-f', 'concat', '-safe', '0')
            .outputOptions('-c', 'copy')
            .output(mergedPath)
            .on('end', () => {
                res.download(mergedPath, 'merged.mp4', () => {
                    fs.rmSync(video1Path);
                    fs.rmSync(video2Path);
                    fs.rmSync(mergedPath);
                    fs.rmSync(concatListPath);
                });
            })
            .on('error', err => {
                console.error(err);
                res.status(500).send('FFmpeg merge error');
            })
            .run();
    } catch (err) {
        console.error(err);
        res.status(500).send('Download or processing error');
    }
});

// Route 2: Add Background Audio
app.post('/add-audio', async (req, res) => {
    const { videoUrl, audioUrl } = req.body;
    if (!videoUrl || !audioUrl) return res.status(400).json({ error: 'videoUrl and audioUrl are required' });

    try {
        const id = uuidv4();
        const videoPath = await downloadFile(videoUrl, `video-${id}.mp4`);
        const audioPath = await downloadFile(audioUrl, `audio-${id}.mp3`);
        const outputPath = path.join(tempDir, `output-${id}.mp4`);

        ffmpeg()
            .input(videoPath)
            .input(audioPath)
            .outputOptions('-map', '0:v:0', '-map', '1:a:0', '-shortest')
            .output(outputPath)
            .on('end', () => {
                res.download(outputPath, 'video-with-audio.mp4', () => {
                    fs.rmSync(videoPath);
                    fs.rmSync(audioPath);
                    fs.rmSync(outputPath);
                });
            })
            .on('error', err => {
                console.error(err);
                res.status(500).send('FFmpeg audio merge error');
            })
            .run();
    } catch (err) {
        console.error(err);
        res.status(500).send('Download or processing error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));