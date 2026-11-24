#!/bin/bash
# sheet.sh VIDEO OUT t1 t2 ... (up to 10) -> 5-wide contact sheet, 260px tiles
V=$1; OUTP=$2; shift 2; D=$(mktemp -d); i=0
for t in "$@"; do ffmpeg -loglevel error -y -ss $t -i $V -frames:v 1 -vf scale=300:-1 $D/$(printf %02d $i).png 2>/dev/null || ffmpeg -loglevel error -y -ss $t -i $V -frames:v 1 -vf scale=300:-1 $D/$(printf %02d $i).png; i=$((i+1)); done
n=$i; cols=5; [ $n -lt 5 ] && cols=$n
ffmpeg -loglevel error -y -pattern_type glob -i "$D/*.png" -vf tile=${cols}x$(( (n+cols-1)/cols )) $OUTP
