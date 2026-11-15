import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "../../lib/format";
import type { Channel } from "../../lib/types";
import { ChannelIcon } from "./ChannelIcon";

interface Props {
  name: string | null;
  avatarUrl?: string | null;
  channel?: Channel;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-base" };

export function ContactAvatar({ name, avatarUrl, channel, size = "md", className }: Props) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <Avatar className={SIZES[size]}>
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className="bg-primary/15 font-semibold text-primary">{initials(name)}</AvatarFallback>
      </Avatar>
      {channel && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full border border-border bg-card p-0.5">
          <ChannelIcon channel={channel} className="h-3 w-3" />
        </span>
      )}
    </div>
  );
}
