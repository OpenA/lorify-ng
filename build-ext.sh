#!/bin/sh

SRC="lorify-ng.user.js settings.html settings.js background.js LICENSE icons/*"
ARC="dist/lorify-ng.zip"
VER="2"

for i in "$@"; do
  case $i in
    --help | -h)
      echo ""
      echo " build-ext.sh [option]\n"
      echo "    -v3    Manifest V3"
      echo "    -v2    Manifest V2 (default)"
      echo ""
      exit
      ;;
    -v3)
      VER="3"
      ;;
    *)
      # unknown option
      ;;
  esac
done

mkdir -p dist
echo "\nbuilding:\033[0;9$VER;49m WebExt Manifest V$VER \033[0m"

if [ "$VER" = "2" ]; then
  sed -e 's/"manifest_version":.*3/"manifest_version": 2/' \
      -e 's/"action"/"browser_action"/' \
      -e 's/"service_worker"/"scripts"/' \
      -e 's/"background.js"/["background.js"], "persistent": true/' \
      -e 's/\],.*"permissions":.*\[/,/' \
      -e 's/"host_permissions"/"permissions"/' \
      manifest.json > dist/manifest.json
  zip -9 -jm $ARC dist/manifest.json
else
  SRC="manifest.json $SRC"
fi

zip -9 -T $ARC $SRC
