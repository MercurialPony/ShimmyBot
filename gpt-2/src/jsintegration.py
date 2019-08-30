#!/usr/bin/env python3

import fire
import json
import os
import numpy as np
import tensorflow as tf
import sys

import model, sample, encoder

def interact_model(
    model_name="345M",
    seed=None,
    length=127,
    temperature=1,
    top_k=40,
    top_p=0.0
):
    enc = encoder.get_encoder(model_name)
    hparams = model.default_hparams()
    with open(os.path.join("models", model_name, "hparams.json")) as f:
        hparams.override_from_dict(json.load(f))

    with tf.Session(graph=tf.Graph()) as sess:
        context = tf.placeholder(tf.int32, [1, None])
        output = sample.sample_sequence(
            hparams=hparams, length=length,
            context=context,
            batch_size=1,
            temperature=temperature, top_k=top_k, top_p=top_p
        )
        np.random.seed(seed)
        tf.set_random_seed(seed)
        ckpt = tf.train.latest_checkpoint(os.path.join('models', model_name))
        saver = tf.train.Saver(allow_empty=True)
        saver.restore(sess, ckpt)
        print("ready")
        sys.stdout.flush();
        while True:
            args = sys.stdin.readline()[:-1] # Remove newline
            args = args.split(";")
            lines = args[0].split("=")
            user = args[1].split("=")
            channel = args[2].split("=")
            #if(lines[0] != "lines" or user[0] != "user" or channel[0] != "channel"):
            #    continue
            raw_text = ""
            for a in range(int(lines[1])):
                raw_text += sys.stdin.readline()
            context_tokens = enc.encode(raw_text)
            out = sess.run(output, feed_dict={
                context: [context_tokens]
            })[:, len(context_tokens):]
            text = enc.decode(out[0])
            print("user=" + user[1] + ";channel=" + channel[1] + ";" + text)
            sys.stdout.flush()

if __name__ == '__main__':
    fire.Fire(interact_model)
