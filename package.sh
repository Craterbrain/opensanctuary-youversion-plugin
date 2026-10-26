#!/bin/sh
# Builds youversion-plugin.zip for Settings > Plugins > Install plugin... in OpenSanctuary.
set -e
cd "$(dirname "$0")/youversion"
rm -f ../youversion-plugin.zip
zip -rq ../youversion-plugin.zip plugin.json index.html youversion.js app.js
echo "built $(cd .. && pwd)/youversion-plugin.zip"
