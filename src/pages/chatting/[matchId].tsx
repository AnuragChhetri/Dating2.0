import {
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
import { useAtom } from "jotai";
import type { NextPage } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { userIdAtom } from "..";
import { trpc } from "../../utils/trpc";
import Countdown from "react-countdown";

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;

export const VideoPlayer = ({
  videoTrack,
  style,
}: {
  videoTrack: IRemoteVideoTrack | ICameraVideoTrack;
  style: object;
}) => {
  const ref = useRef(null);

  useEffect(() => {
    const playerRef = ref.current;
    if (!videoTrack) return;
    if (!playerRef) return;

    videoTrack.play(playerRef);

    return () => {
      videoTrack.stop();
    };
  }, [videoTrack]);

  return <div ref={ref} style={style}></div>;
};

const ChattingPage: NextPage = () => {
  const [timeLeft] = useState(Date.now() + 1000 * 20);
  const [userId] = useAtom(userIdAtom);
  const router = useRouter();
  const matchId = router.query.matchId as string;
  const matchQuery = trpc.useQuery(["matches.getMatch", { matchId }]);
  const tokenQuery = trpc.useQuery(["matches.getToken", { matchId, userId }], {
    refetchOnWindowFocus: false,
    cacheTime: 0,
    staleTime: 0,
  });
  const [otherUser, setOtherUser] = useState<IAgoraRTCRemoteUser>();
  const [videoTrack, setVideoTrack] = useState<ICameraVideoTrack>();

  const setStatusMutation = trpc.useMutation("users.setStatus");

  useEffect(() => {
    if (!userId) return;
    setStatusMutation.mutate({ userId, status: "chatting" });
  }, []);

  let otherUserName = "";

  if (matchQuery.data) {
    const isSinkUser = matchQuery.data.sinkUserId === userId;
    otherUserName = isSinkUser
      ? matchQuery.data.sinkUser.name
      : matchQuery.data.sourceUser.name;
  }

  const handleCountdownCompleted = () => {
    router.push("/done");
  };

  useEffect(() => {
    if (!userId) {
      router.push("/");
      return;
    }

    const token = tokenQuery.data;

    if (!token) return;

    const connect = async () => {
      console.log("connecting", userId);
      const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");

      const client = AgoraRTC.createClient({
        mode: "rtc",
        codec: "vp8",
      });

      await client.join(APP_ID, matchId, token, userId);

      client.on("user-published", (otherUser, mediaType) => {
        client.subscribe(otherUser, mediaType).then(() => {
          if (mediaType === "video") {
            setOtherUser(otherUser);
          }
        });
      });

      const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
      setVideoTrack(tracks[1]);
      await client.publish(tracks[1]);

      return { tracks, client };
    };

    const connection = connect();

    return () => {
      console.log("inside clean up");
      const disconnect = async () => {
        const { tracks, client } = await connection;
        client.removeAllListeners();
        tracks[1]?.stop();
        tracks[1]?.close();
        await client.unpublish(tracks[1]);
        await client.leave();
      };
      disconnect();
    };
  }, [tokenQuery.data]);

  return (
    <>
      <Head>
        <title>Chatting with User</title>
        <meta name="description" content="Generated by create-t3-app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto flex flex-col gap-6 items-center justify-center min-h-screen p-4">
        <h3 className="text-xl">Chatting with {otherUserName}</h3>

        <Countdown date={timeLeft} onComplete={handleCountdownCompleted} />

        <div className="grid grid-cols-2">
          {otherUser?.videoTrack && (
            <VideoPlayer
              style={{ width: "300px", height: "300px" }}
              videoTrack={otherUser.videoTrack}
            />
          )}
          {videoTrack && (
            <VideoPlayer
              style={{ width: "300px", height: "300px" }}
              videoTrack={videoTrack}
            />
          )}
        </div>
      </main>
    </>
  );
};

export default ChattingPage;
