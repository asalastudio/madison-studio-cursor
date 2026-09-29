import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null;
  currentMemberCount: number;
  memberLimit: number;
}

export function InviteMemberDialog({ 
  open, 
  onOpenChange, 
  organizationId,
  currentMemberCount,
  memberLimit 
}: InviteMemberDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!organizationId) {
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive",
      });
      return;
    }

    // Check member limit
    if (currentMemberCount >= memberLimit) {
      toast({
        title: "Member limit reached",
        description: `You can only have up to ${memberLimit} members in your organization.`,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Insert invitation
      const { error } = await supabase
        .from("team_invitations")
        .insert({
          organization_id: organizationId,
          email: email.toLowerCase().trim(),
          role: role,
        });

      if (error) {
        if (error.code === "23505") { // Unique constraint violation
          throw new Error("An invitation for this email already exists");
        }
        throw error;
      }

      // Get organization name
      const { data: orgData } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .single();

      // Send invitation email
      try {
        const { error: emailError } = await supabase.functions.invoke("send-team-invitation", {
          body: {
            email: email.toLowerCase().trim(),
            organizationId,
            organizationName: orgData?.name || "your team",
            role: role,
            invitedByName: user?.user_metadata?.full_name || user?.email || "A team member",
            appUrl: window.location.origin,
          },
        });

        if (emailError) {
          console.error("Email send error:", emailError);
          toast({
            title: "Invitation created",
            description: "The invitation was created but the email could not be sent. The member can still join by signing up.",
          });
        } else {
          toast({
            title: "Invitation sent!",
            description: `${email} has been invited via email.`,
          });
        }
      } catch (emailError) {
        console.error("Email send error:", emailError);
        toast({
          title: "Invitation created",
          description: "The invitation was created but the email could not be sent. The member can still join by signing up.",
        });
      }

      // Refresh invitations list
      queryClient.invalidateQueries({ queryKey: ["team-invitations", organizationId] });
      
      // Reset form
      setEmail("");
      setRole("member");
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Add a team member by email. They'll join your organization when they sign up or log in.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(value: "member" | "admin") => setRole(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-neutral-500">
              {role === "member" 
                ? "Can create and edit their own content" 
                : "Can manage team members and organization settings"}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-brass hover:bg-brass-light text-charcoal"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Invitation"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
