import { auth } from "./firebase";
import { updatePassword, updateEmail, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { userApi } from "@/services/api/userApi";
import { getBranchFromDepartment } from "@/constants";

export interface UserProfile {
  name: string;
  id: string; 
  email: string;
  mobile: string;
  joiningYear: number;
  branch: string;
}

const mapApiToProfile = (apiData: any): UserProfile => {
  const joiningYear = apiData.current_year || 1;

  return {
    name: apiData.name || '',
    id: apiData.usn || '',
    email: apiData.email || '',
    mobile: apiData.mobile_number || '',
    joiningYear,
    branch: getBranchFromDepartment(apiData.department) || apiData.department || '',
  };
};

export const fetchUserProfile = async (_userId: string): Promise<UserProfile | null> => {
  try {
    const apiData = await userApi.getUserProfile();
    return mapApiToProfile(apiData);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    throw error;
  }
};

export const updateUserEmail = async (newEmail: string, password: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("No user logged in");
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);

    await updateEmail(user, newEmail);
  } catch (error) {
    console.error("Error updating email:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to update email";
    throw new Error(errorMessage);
  }
};

export const updateUserPassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("No user logged in");
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    await updatePassword(user, newPassword);
  } catch (error) {
    console.error("Error updating password:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to update password";
    throw new Error(errorMessage);
  }
};

