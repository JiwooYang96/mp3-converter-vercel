# YouTube to MP3 Converter

A web application that allows users to convert YouTube videos to MP3 format easily.

## Features

- Simple web interface for entering YouTube URLs
- Extracts audio from YouTube videos and converts to MP3 format
- Shows video information including thumbnail, title, and duration
- Downloads the converted MP3 file

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Installation

1. Clone or download this repository
2. Navigate to the project directory
3. Install dependencies:

`ash
cd mp3-converter/backend
npm install
`

4. Start the server:

`ash
npm start
`

5. Open your browser and go to http://localhost:3000

## How It Works

- This application uses yt-dlp to extract audio from YouTube videos
- ffmpeg is used for the actual conversion to MP3 format
- The server handles file extraction, conversion, and delivery
- Temporary files are automatically cleaned up after 30 minutes

## Legal Disclaimer

This tool should only be used for converting non-copyrighted content or content that you have the rights to use. The developers of this tool are not responsible for any misuse or copyright violations.

## License

This project is for personal use only and not for commercial distribution.
