## About
Shimmy is a unique discord bot that can do a few neat things such as watching the pixel canvas at http://skelux.net/place.php, sharing your favorite youtube videos, deviantart pieces and best of all, chat with users via GPT-2, a natural language processing neural network by OpenAI.

## How to set up
1. Install all the js dependencies from package-lock.json
2. Clone the GPT-2 repo into the /gpt-2 directory and install its python dependencies. Download the model you'd like to run and place it under /gpt-2/src/models
3. Add your api tokens to /data/auth.json
4. Configure the bot's settings in /data/config.json including the gpt-2 the name of the folder which contains your desired gpt-2 model
5. Start shimmybot.js
