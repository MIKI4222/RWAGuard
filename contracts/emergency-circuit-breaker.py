# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
from datetime import datetime, timezone


DEFAULT_MONITORED_URL = (
    "https://www.githubstatus.com/api/v2/status.json"
)


def classify_status_response(
    raw_body: str,
    fail_closed: bool,
) -> bool:
    """
    Returns:

    True:
        source is degraded, unavailable, or unknown;

    False:
        source is operational.
    """

    try:
        payload = json.loads(raw_body)

        # First try the GitHub Status API format:
        #
        # {
        #   "status": {
        #       "indicator": "none"
        #   }
        # }
        status_value = payload.get("status")

        indicator = ""

        try:
            indicator = status_value.get(
                "indicator",
                "",
            )
        except Exception:
            indicator = status_value

        if indicator is not None:
            normalized_indicator = str(
                indicator
            ).strip().lower()

            if normalized_indicator in (
                "none",
                "operational",
                "ok",
                "healthy",
                "up",
                "online",
            ):
                return False

            if normalized_indicator in (
                "degraded",
                "major_outage",
                "major",
                "outage",
                "down",
                "critical",
                "unavailable",
                "incident",
                "error",
                "failed",
            ):
                return True

        # Other common API formats:
        #
        # {"state": "operational"}
        # {"aggregate_state": "major_outage"}
        # {"health": "healthy"}
        values_to_check = (
            payload.get("state"),
            payload.get("aggregate_state"),
            payload.get("health"),
        )

        for value in values_to_check:
            if value is None:
                continue

            normalized_value = str(
                value
            ).strip().lower()

            if normalized_value in (
                "operational",
                "ok",
                "healthy",
                "up",
                "online",
                "none",
            ):
                return False

            if normalized_value in (
                "degraded",
                "major_outage",
                "major",
                "outage",
                "down",
                "critical",
                "unavailable",
                "incident",
                "error",
                "failed",
            ):
                return True

        # Unknown JSON format.
        return fail_closed

    except Exception:
        # Empty body, invalid JSON, HTTP error,
        # or unexpected response format.
        return fail_closed


class EmergencyCircuitBreaker(gl.Contract):
    """
    Decentralized Emergency Circuit Breaker.

    The contract monitors an external status endpoint.
    Validators independently fetch and classify the endpoint.
    Consensus is reached on a canonical boolean decision.
    """

    # Required state
    is_paused: bool
    last_check_timestamp: u64
    incident_count: u32
    monitored_url: str

    # Security state
    owner: Address
    fail_closed: bool
    pause_threshold: u32

    # Observability state
    last_verdict: str
    last_checked_url: str
    guarded_action_count: u32

    def __init__(self):
        # One-click deployment configuration.
        self.monitored_url = DEFAULT_MONITORED_URL
        self.fail_closed = True
        self.pause_threshold = u32(1)

        # Initial state.
        self.is_paused = False
        self.last_check_timestamp = u64(0)
        self.incident_count = u32(0)

        self.last_verdict = "not_checked"
        self.last_checked_url = ""
        self.guarded_action_count = u32(0)

        # Deployer becomes the owner.
        self.owner = gl.message.sender_address

    @gl.public.write
    def set_monitored_url(
        self,
        new_url: str,
    ) -> bool:
        """
        Changes the monitored endpoint.

        Only the owner can change it.
        Changing the URL invalidates the previous verdict.
        """

        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(
                "only owner can change monitored URL"
            )

        if new_url == "":
            raise gl.vm.UserError(
                "monitored URL must not be empty"
            )

        self.monitored_url = new_url

        # The previous verdict belonged to another URL.
        self.last_verdict = "not_checked"
        self.last_checked_url = ""

        return True

    @gl.public.write
    def health_check(self) -> bool:
        """
        Performs a consensus-based health check.

        Returns:

        false:
            source is operational;

        true:
            source is degraded, unavailable, or unknown.
        """

        # Read storage before entering the nondeterministic block.
        monitored_url = self.monitored_url
        fail_closed = self.fail_closed

        def read_and_classify() -> bool:
            try:
                response = gl.nondet.web.get(
                    monitored_url
                )

                raw_body = response.body.decode(
                    "utf-8"
                )

                return classify_status_response(
                    raw_body,
                    fail_closed,
                )

            except Exception:
                # Fail-closed behavior.
                return fail_closed

        # Equivalence Principle.
        # Validators must agree on the exact boolean value.
        is_degraded = gl.eq_principle.strict_eq(
            read_and_classify
        )

        # State changes happen after consensus.
        self.last_check_timestamp = u64(
            int(
                datetime.now(
                    timezone.utc
                ).timestamp()
            )
        )

        # Bind the verdict to the exact URL used by this check.
        self.last_checked_url = monitored_url

        if is_degraded:
            self.last_verdict = "degraded"
            self.incident_count += u32(1)

            if self.incident_count >= self.pause_threshold:
                self.is_paused = True

        else:
            self.last_verdict = "operational"

        return is_degraded

    @gl.public.write
    def execute_guarded_action(
        self,
        action_data: str,
    ) -> str:
        """
        Example of a protected operation.

        Replace this body with a real protocol action
        in a production integration.
        """

        if self.is_paused:
            raise gl.vm.UserError(
                "circuit breaker is active"
            )

        self.guarded_action_count += u32(1)

        return (
            "guarded action executed: "
            + action_data
        )

    @gl.public.write
    def emergency_unpause(self) -> bool:
        """
        Manually clears the pause.

        A fresh operational health check for the current URL
        is required first.
        """

        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(
                "only owner can unpause"
            )

        if self.last_verdict != "operational":
            raise gl.vm.UserError(
                "operational health check required"
            )

        if self.last_checked_url != self.monitored_url:
            raise gl.vm.UserError(
                "operational verdict belongs to another URL"
            )

        self.is_paused = False

        return True

    @gl.public.view
    def get_status(self) -> str:
        if self.is_paused:
            return "PAUSED"

        return "ACTIVE"

    @gl.public.view
    def get_monitored_url(self) -> str:
        return self.monitored_url

    @gl.public.view
    def get_last_verdict(self) -> str:
        return self.last_verdict

    @gl.public.view
    def get_last_checked_url(self) -> str:
        return self.last_checked_url

    @gl.public.view
    def get_incident_count(self) -> u32:
        return self.incident_count

    @gl.public.view
    def get_last_check_timestamp(self) -> u64:
        return self.last_check_timestamp

    @gl.public.view
    def get_guarded_action_count(self) -> u32:
        return self.guarded_action_count
