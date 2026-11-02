type TimerHandle = number | ReturnType<typeof setTimeout>;

type SetTimer = (callback: () => void, ms: number) => TimerHandle;

type ClearTimer = (handle: TimerHandle) => void;

type Now = () => number;

interface Point {
  x: number;
  y: number;
}
