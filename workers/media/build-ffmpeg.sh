#!/bin/sh
set -eu
# Invoke from the verified FFmpeg 9.0.2 source directory. No untrusted media input.
./configure --prefix="$1" --disable-autodetect --enable-zlib --disable-doc --disable-network \
 --disable-x86asm --disable-debug --disable-ffplay --disable-everything \
 --enable-ffmpeg --enable-ffprobe --enable-protocol=file,pipe \
 --enable-demuxer=wav,aiff,flac,mov,image2,image2pipe,image_png_pipe,image_jpeg_pipe,image_webp_pipe \
 --enable-muxer=ipod,pcm_f32le,null,wav,aiff,flac,image2 \
 --enable-decoder=pcm_s8,pcm_u8,pcm_s16le,pcm_s16be,pcm_s24le,pcm_s24be,pcm_s32le,pcm_s32be,pcm_f32le,pcm_f32be,pcm_f64le,pcm_f64be,flac,aac,png,mjpeg,webp \
 --enable-encoder=aac,pcm_f32le,pcm_s16le,pcm_s16be,flac,png,mjpeg,wrapped_avframe \
 --enable-parser=aac,flac,png,mjpeg,webp --enable-filter=atrim,asetpts,aresample,aformat,anull,format,scale \
 --enable-swresample --enable-swscale
make -j2
make install
