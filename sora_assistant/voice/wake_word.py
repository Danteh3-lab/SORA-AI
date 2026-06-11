from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable


WakeCallback = Callable[[], None]


class WakeWordListener(ABC):
    @abstractmethod
    def start(self, on_wake: WakeCallback) -> None:
        raise NotImplementedError

    @abstractmethod
    def stop(self) -> None:
        raise NotImplementedError


class DisabledWakeWordListener(WakeWordListener):
    def start(self, on_wake: WakeCallback) -> None:
        return None

    def stop(self) -> None:
        return None

