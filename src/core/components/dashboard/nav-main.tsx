import { Binoculars, ChevronRight, Home, type LucideIcon } from "lucide-react"

import { useEffect } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/core/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/core/components/ui/sidebar"
import { ModeToggle } from "../mode-toggle"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/core/components/ui/select"
import { convertTeamRole } from "@/core/lib/utils";
import { useNavigationConfirm } from "@/core/hooks/useNavigationConfirm";
import { NavigationConfirmDialog } from "@/core/components/NavigationConfirmDialog";
import { useScout } from "@/core/contexts/ScoutContext";


export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
    items?: {
      title: string
      url: string
    }[]
  }[]
}) {

  const { playerStation, setPlayerStation } = useScout();

  const handlePlayerStationChange = (value: string) => {
    setPlayerStation(value);
  };

  const { isMobile, setOpenMobile } = useSidebar();
  const {
    confirmNavigation,
    handleConfirm,
    handleCancel,
    isConfirmDialogOpen,
    pendingDestinationLabel
  } = useNavigationConfirm();

  // navigate to the destination page
  const proceedClick = (url?: string) => {
    const destination = url || "/";
    const label = url === "/" ? "Home" : "this page";

    if (confirmNavigation(destination, label)) {
      // Navigation was allowed immediately
      if (isMobile) {
        setOpenMobile(false);
      }
    }
    // If navigation was blocked, confirmNavigation will show the dialog
  };

  // Handler for sub-menu clicks
  const handleSubItemClick = (url: string) => {
    const label = url.split('/').pop() || "this page";

    if (confirmNavigation(url, label)) {
      // Navigation was allowed immediately
      if (isMobile) {
        setOpenMobile(false);
      }
    }
    // If navigation was blocked, confirmNavigation will show the dialog
  };

  // Close sidebar when navigation is confirmed
  const handleConfirmNavigation = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
    handleConfirm();
  };

  useEffect(() => {
    if (playerStation) {
      const element = document.getElementById(playerStation.toLowerCase().replace(" ", ""));
      if (element) {
        (element as HTMLInputElement).checked = true;
      }
    }
  }, [playerStation]);

  return (
    <>
      <SidebarGroup>
        <SidebarMenuItem className="flex items-center pb-4">
          <div className="flex w-full gap-2">
            <Select
              value={playerStation}
              onValueChange={handlePlayerStationChange}
            >
              <SelectTrigger className="w-full h-12 text-lg font-bold" id="scoutRole" aria-label="Scout Role">
                <SelectValue placeholder={convertTeamRole(playerStation) || "Role"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem className="text-lg" value="lead">Lead</SelectItem>
                <SelectItem className="text-lg" value="red-1">Red 1</SelectItem>
                <SelectItem className="text-lg" value="red-2">Red 2</SelectItem>
                <SelectItem className="text-lg" value="red-3">Red 3</SelectItem>
                <SelectItem className="text-lg" value="blue-1">Blue 1</SelectItem>
                <SelectItem className="text-lg" value="blue-2">Blue 2</SelectItem>
                <SelectItem className="text-lg" value="blue-3">Blue 3</SelectItem>
              </SelectContent>
            </Select>
            <ModeToggle />
          </div>
        </SidebarMenuItem>
        <SidebarGroupLabel>Platform</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton tooltip={"Home"} onClick={() => proceedClick("/")}>
              <Home />
              <span>Home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton tooltip={"Scout"} onClick={() => proceedClick("/game-start")}>
              <Binoculars />
              <span>Scout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {items.map((item) => (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={item.isActive}
              className="group/collapsible"
            >

              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton asChild>
                          <button onClick={() => handleSubItemClick(subItem.url)}>
                            <span>{subItem.title}</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          ))}
        </SidebarMenu>
      </SidebarGroup>

      <NavigationConfirmDialog
        open={isConfirmDialogOpen}
        onConfirm={handleConfirmNavigation}
        onCancel={handleCancel}
        destinationLabel={pendingDestinationLabel}
      />
    </>
  )
}