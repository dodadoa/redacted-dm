(
s.options.memSize = 65536 * 4;
s.options.numBuffers = 1024 * 16;
s.options.maxNodes = 1024 * 32;
)

(
s.waitForBoot {
    "server booted".postln;
};
)

(
var lastPingTime = 0.0, minPingInterval = 0.1; // seconds between synth triggers

OSCdef(\ping57120,
    { |msg, time|
        var freq, amp;
        if ((time - lastPingTime) > minPingInterval) {
            lastPingTime = time;
			freq = rrand(200.0, 700.0);
            Synth(\electronic_fly, [\freq, freq, \amp, 0.8]);
        };
    },
    '/redacted-dm/trigger',
    nil,      // srcID
    57120     // recvPort
);
)


(
SynthDef(\electronic_fly, {
	arg freq = 440, amp = 1.0;
	var snd;
	snd = Saw.ar(freq);
	snd = RLPF.ar(snd, LFNoise2.kr(3 ! 8).linexp(-1, 1, 10, 8000), 0.1);
	snd = snd * EnvGen.ar(Env.perc(0.01, 0.75, 1), doneAction: 2);
	snd = snd + PitchShift.ar(snd, 0.2, 2);
	snd = snd + PitchShift.ar(snd, 0.5, 5);
	snd = snd.tanh;
	snd = snd * -12.dbamp;
	snd = snd ! 2;
	snd = snd * amp;
	Out.ar(\out.kr(0), snd);
}).add
)
